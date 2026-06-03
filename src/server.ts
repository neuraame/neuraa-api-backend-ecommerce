import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './db';

// Load environment variables
dotenv.config();

// BigInt Serialization Fix: Override toJSON for BigInts
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


// 6. Inquiry / Contact Form Endpoint
app.post('/api/inquiries', async (req, res) => {
  const { name, contactNumber, email, requirement } = req.body;

  if (!name || !contactNumber || !email || !requirement) {
    return res.status(400).json({ error: 'All fields are required: name, contactNumber, email, requirement' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  try {
    const inquiry = await prisma.inquiry.create({
      data: {
        name: name.trim(),
        contactNumber: contactNumber.trim(),
        email: email.trim().toLowerCase(),
        requirement: requirement.trim(),
      },
    });
    
    // Log the successful submission to the console
    console.log(`✅ [New Inquiry] Received and stored submission from: ${inquiry.name} (${inquiry.email})`);
    
    res.status(201).json({ success: true, message: 'Inquiry submitted successfully!', id: inquiry.id });
  } catch (error) {
    console.error('Error saving inquiry:', error);
    res.status(500).json({ error: 'Failed to submit inquiry. Please try again.' });
  }
});

app.get('/api/inquiries', async (req, res) => {
  try {
    const inquiries = await prisma.inquiry.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(inquiries);
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// Banner endpoints
app.post('/api/banners', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  try {
    // For simplicity, we assume there's only one active banner or we just keep adding them
    // and fetch the latest one
    const banner = await prisma.banner.create({
      data: { imageUrl }
    });
    res.status(201).json(banner);
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ error: 'Failed to create banner' });
  }
});

app.get('/api/banners', async (req, res) => {
  try {
    // Fetch the most recent banner
    const banner = await prisma.banner.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    res.json(banner);
  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({ error: 'Failed to fetch banner' });
  }
});

app.put('/api/banners/:id', async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  try {
    const banner = await prisma.banner.update({
      where: { id },
      data: { imageUrl }
    });
    res.json(banner);
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Neuraa API running on port ${PORT}`);
});
