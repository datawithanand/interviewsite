const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../utils/validation');

const router = express.Router();

router.use(authenticate);

function serialize(s) {
  return { id: s.id, name: s.name, filters: JSON.parse(s.filters), createdAt: s.createdAt };
}

router.get('/', async (req, res, next) => {
  try {
    const searches = await prisma.savedSearch.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ savedSearches: searches.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().trim().min(1).max(80), filters: z.record(z.any()) });
    const data = validate(schema, req.body);

    const existing = await prisma.savedSearch.findUnique({
      where: { userId_name: { userId: req.user.id, name: data.name } },
    });
    if (existing) return res.status(409).json({ error: 'You already have a saved search with this name.' });

    const created = await prisma.savedSearch.create({
      data: { userId: req.user.id, name: data.name, filters: JSON.stringify(data.filters) },
    });
    res.status(201).json({ savedSearch: serialize(created) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'Saved search not found.' });
    }
    await prisma.savedSearch.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
