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
app.use(express.json({ limit: '20mb' })); // Allow large base64 images

// ── Hardcoded Admin Credentials ──────────────────────────────
const ADMIN_USERNAME = 'NeuraaAdmin';
const ADMIN_PASSWORD = 'NEUrra@2025';

// ─────────────────────────────────────────────────────────────
// INQUIRY endpoints
// ─────────────────────────────────────────────────────────────

app.post('/api/inquiries', async (req, res) => {
  const { name, contactNumber, email, requirement } = req.body;

  if (!name || !contactNumber || !email || !requirement) {
    return res.status(400).json({ error: 'All fields are required: name, contactNumber, email, requirement' });
  }

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

// ─────────────────────────────────────────────────────────────
// PUBLIC BANNER endpoint (used by Dashboard-neuraa)
// Returns all banners ordered by slot
// ─────────────────────────────────────────────────────────────

app.get('/api/banners', async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { slot: 'asc' },
    });
    res.json(banners);
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN endpoints
// ─────────────────────────────────────────────────────────────

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    console.log(`✅ [Admin Login] Successful login for: ${username}`);
    return res.json({ success: true, message: 'Login successful' });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

// GET all banner slots (admin view — returns slots 1, 2, 3)
app.get('/api/admin/banners', async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: { slot: 'asc' },
    });
    res.json(banners);
  } catch (error) {
    console.error('Error fetching admin banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// PUT — upsert image and headings for a specific slot (1, 2, or 3)
app.put('/api/admin/banners/:slot', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { imageUrl, heading1, heading2, heading3 } = req.body;

  if (isNaN(slot) || slot < 1 || slot > 3) {
    return res.status(400).json({ error: 'Slot must be 1, 2, or 3' });
  }

  try {
    // If imageUrl is missing, maybe we are just updating text.
    // However, Prisma upsert needs imageUrl if creating for the first time.
    // We'll fetch the existing to get current imageUrl if it's missing in req.body
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
       const existing = await prisma.banner.findUnique({ where: { slot } });
       finalImageUrl = existing?.imageUrl || "";
    }

    const banner = await prisma.banner.upsert({
      where: { slot },
      update: { 
        imageUrl: finalImageUrl,
        heading1: heading1 !== undefined ? heading1 : undefined,
        heading2: heading2 !== undefined ? heading2 : undefined,
        heading3: heading3 !== undefined ? heading3 : undefined,
      },
      create: { 
        slot, 
        imageUrl: finalImageUrl,
        heading1,
        heading2,
        heading3,
      },
    });
    console.log(`✅ [Admin] Banner slot ${slot} updated`);
    res.json(banner);
  } catch (error) {
    console.error('Error upserting banner:', error);
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

// DELETE — remove image for a specific slot
app.delete('/api/admin/banners/:slot', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);

  if (isNaN(slot) || slot < 1 || slot > 3) {
    return res.status(400).json({ error: 'Slot must be 1, 2, or 3' });
  }

  try {
    await prisma.banner.deleteMany({ where: { slot } });
    console.log(`🗑️  [Admin] Banner slot ${slot} removed`);
    res.json({ success: true, message: `Banner slot ${slot} removed` });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Neuraa API running on port ${PORT}`);
});
