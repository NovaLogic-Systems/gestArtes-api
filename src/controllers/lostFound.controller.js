const lostFoundService = require('../services/lostFound.service');

async function listPublic(req, res, next) {
  try {
    const items = await lostFoundService.listPublicItems();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

async function getPublicById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await lostFoundService.getPublicItemById(id);

    if (!item) {
      res.status(404).json({ error: 'Lost and found item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const item = await lostFoundService.createItem(req.body, req.session.userId);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await lostFoundService.updateItem(id, req.body);

    if (!item) {
      res.status(404).json({ error: 'Lost and found item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const deleted = await lostFoundService.deleteItem(id);

    if (!deleted) {
      res.status(404).json({ error: 'Lost and found item not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function claim(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await lostFoundService.claimItem(id, req.body.adminNotes);

    if (!item) {
      res.status(404).json({ error: 'Lost and found item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
}

async function archive(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await lostFoundService.archiveItem(id, req.body.adminNotes);

    if (!item) {
      res.status(404).json({ error: 'Lost and found item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPublic,
  getPublicById,
  create,
  update,
  remove,
  claim,
  archive,
};
