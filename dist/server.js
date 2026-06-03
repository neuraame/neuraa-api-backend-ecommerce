"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
// Load environment variables
dotenv_1.default.config();
// BigInt Serialization Fix: Override toJSON for BigInts
BigInt.prototype.toJSON = function () {
    return Number(this);
};
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 1. Overview Endpoints: aggregated statistics for the dashboard
app.get('/api/overview', async (req, res) => {
    try {
        // Fetch metrics
        const metrics = await db_1.default.metric.findMany({
            orderBy: { timestamp: 'asc' },
        });
        // Fetch models count
        const totalModels = await db_1.default.model.count();
        const activeModels = await db_1.default.model.count({ where: { status: 'DEPLOYED' } });
        // Fetch datasets count
        const totalDatasets = await db_1.default.dataset.count();
        // Fetch recent training runs
        const recentRuns = await db_1.default.trainingRun.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { model: true },
        });
        // Calculate aggregated stats from metrics
        const totalRequests = metrics.reduce((sum, m) => sum + m.requests, 0);
        const totalTokens = metrics.reduce((sum, m) => sum + m.tokensUsed, 0);
        const avgLatency = metrics.length > 0
            ? Math.round(metrics.reduce((sum, m) => sum + m.latencyMs, 0) / metrics.length)
            : 0;
        res.json({
            metrics,
            stats: {
                totalRequests,
                totalTokens,
                avgLatency,
                totalModels,
                activeModels,
                totalDatasets,
            },
            recentRuns,
        });
    }
    catch (error) {
        console.error('Error fetching overview stats:', error);
        res.status(500).json({ error: 'Failed to fetch overview statistics' });
    }
});
// 2. Models CRUD Endpoints
app.get('/api/models', async (req, res) => {
    try {
        const models = await db_1.default.model.findMany({
            include: {
                runs: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(models);
    }
    catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});
app.post('/api/models', async (req, res) => {
    const { name, type, version, status, accuracy } = req.body;
    if (!name || !type) {
        return res.status(400).json({ error: 'Name and Type are required' });
    }
    try {
        const newModel = await db_1.default.model.create({
            data: {
                name,
                type,
                version: version || 'v1.0.0',
                status: status || 'OFFLINE',
                accuracy: accuracy !== undefined ? parseFloat(accuracy) : 0.0,
            },
        });
        res.status(201).json(newModel);
    }
    catch (error) {
        console.error('Error creating model:', error);
        res.status(500).json({ error: 'Failed to create model' });
    }
});
app.put('/api/models/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, version, status, accuracy } = req.body;
    try {
        const updatedModel = await db_1.default.model.update({
            where: { id },
            data: {
                name,
                type,
                version,
                status,
                accuracy: accuracy !== undefined ? parseFloat(accuracy) : undefined,
            },
        });
        res.json(updatedModel);
    }
    catch (error) {
        console.error('Error updating model:', error);
        res.status(500).json({ error: 'Failed to update model' });
    }
});
app.delete('/api/models/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.default.model.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting model:', error);
        res.status(500).json({ error: 'Failed to delete model' });
    }
});
// 3. Training Runs Endpoints
app.get('/api/runs', async (req, res) => {
    try {
        const runs = await db_1.default.trainingRun.findMany({
            include: { model: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(runs);
    }
    catch (error) {
        console.error('Error fetching training runs:', error);
        res.status(500).json({ error: 'Failed to fetch training runs' });
    }
});
app.post('/api/runs', async (req, res) => {
    const { modelId, epochs } = req.body;
    if (!modelId) {
        return res.status(400).json({ error: 'Model ID is required' });
    }
    try {
        // Verify model exists
        const model = await db_1.default.model.findUnique({ where: { id: modelId } });
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }
        // Set model status to training
        await db_1.default.model.update({
            where: { id: modelId },
            data: { status: 'TRAINING' },
        });
        const newRun = await db_1.default.trainingRun.create({
            data: {
                modelId,
                status: 'RUNNING',
                epochs: epochs || 10,
                loss: 1.0, // Start with high loss
                accuracy: 0.1, // Start with low accuracy
                duration: 0,
            },
            include: { model: true },
        });
        // Simulate completion in the background after some time
        setTimeout(async () => {
            try {
                const finalAccuracy = Math.min(0.99, Number((0.75 + Math.random() * 0.23).toFixed(3)));
                const finalLoss = Number((0.05 + Math.random() * 0.15).toFixed(3));
                const duration = Math.floor(60 + Math.random() * 300); // 1-6 minutes
                await db_1.default.trainingRun.update({
                    where: { id: newRun.id },
                    data: {
                        status: 'COMPLETED',
                        accuracy: finalAccuracy,
                        loss: finalLoss,
                        duration,
                    },
                });
                await db_1.default.model.update({
                    where: { id: modelId },
                    data: {
                        status: 'DEPLOYED',
                        accuracy: finalAccuracy,
                    },
                });
                console.log(`Simulation complete for training run ${newRun.id}. Model updated.`);
            }
            catch (simError) {
                console.error('Error finishing simulated run:', simError);
            }
        }, 15000); // 15 seconds simulation for training run completion
        res.status(201).json(newRun);
    }
    catch (error) {
        console.error('Error creating training run:', error);
        res.status(500).json({ error: 'Failed to trigger training run' });
    }
});
// 4. Datasets Endpoints
app.get('/api/datasets', async (req, res) => {
    try {
        const datasets = await db_1.default.dataset.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(datasets);
    }
    catch (error) {
        console.error('Error fetching datasets:', error);
        res.status(500).json({ error: 'Failed to fetch datasets' });
    }
});
app.post('/api/datasets', async (req, res) => {
    const { name, sizeBytes, format, rowsCount } = req.body;
    if (!name || !format) {
        return res.status(400).json({ error: 'Name and Format are required' });
    }
    try {
        const newDataset = await db_1.default.dataset.create({
            data: {
                name,
                sizeBytes: sizeBytes ? BigInt(sizeBytes) : BigInt(1024 * 1024),
                format,
                rowsCount: rowsCount ? parseInt(rowsCount) : 1000,
                status: 'READY',
            },
        });
        res.status(201).json(newDataset);
    }
    catch (error) {
        console.error('Error creating dataset:', error);
        res.status(500).json({ error: 'Failed to create dataset' });
    }
});
// 5. Playground Evaluator Endpoints
app.post('/api/playground', async (req, res) => {
    const { modelId, prompt, temperature } = req.body;
    if (!modelId || !prompt) {
        return res.status(400).json({ error: 'Model ID and Prompt are required' });
    }
    try {
        const model = await db_1.default.model.findUnique({ where: { id: modelId } });
        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }
        if (model.status !== 'DEPLOYED') {
            return res.status(400).json({ error: `Model '${model.name}' is currently offline or training. Please select a deployed model.` });
        }
        // Mock completion responses based on temperature & prompt length
        const responses = [
            `Based on the provided prompt "${prompt}", I have analyzed the weights and parameters. The cognitive neural matrix suggests an optimal path vector of [0.42, 0.98, -0.15]. Tuning temperature to ${temperature || 0.7} optimizes response consistency.`,
            `Neuraa Cognitive Inference System:\nModel: ${model.name}\nVersion: ${model.version}\nAccuracy: ${(model.accuracy * 100).toFixed(1)}%\n\nResult:\nThe multi-layered transformer architecture evaluated this input and mapped it to class indices. Logits output shows strong signal correlation with contextual embeddings.`,
            `Here is a simulated output response for prompt: "${prompt}"\n\n\`\`\`json\n{\n  "status": "success",\n  "inference_time_ms": 142,\n  "model_accuracy": ${model.accuracy},\n  "tokens_evaluated": ${Math.floor(prompt.length / 4) + 12}\n}\n\`\`\``
        ];
        const chosenResponse = responses[Math.floor(Math.random() * responses.length)];
        const tokensUsed = Math.floor(prompt.length / 4) + chosenResponse.length / 4 + 10;
        const latencyMs = Math.floor(80 + Math.random() * 150);
        // Save metric representing this request
        await db_1.default.metric.create({
            data: {
                requests: 1,
                latencyMs,
                tokensUsed,
            },
        });
        res.json({
            modelName: model.name,
            response: chosenResponse,
            metrics: {
                latencyMs,
                tokensUsed,
            },
        });
    }
    catch (error) {
        console.error('Error executing playground run:', error);
        res.status(500).json({ error: 'Failed to execute inference run' });
    }
});
// Start Server
app.listen(PORT, () => {
    console.log(`Neuraa API running on port ${PORT}`);
});
