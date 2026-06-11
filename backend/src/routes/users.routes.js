const express = require('express');

const service = require('../services/users.service');

const { authenticate, requireAdmin } = require('../middleware/auth');

const { validate } = require('../middleware/validate');

const { registerSchema } = require('../validators/schemas');



const router = express.Router();

router.use(authenticate);

router.use(requireAdmin);



router.get('/permissions', async (req, res, next) => {

  try {

    const data = await service.listAllPermissions();

    res.json({ success: true, data });

  } catch (err) { next(err); }

});



router.get('/roles', async (req, res, next) => {

  try {

    const data = await service.getRoles();

    res.json({ success: true, data });

  } catch (err) { next(err); }

});



router.get('/roles/:roleId/permissions', async (req, res, next) => {

  try {

    const data = await service.getPermissions(req.params.roleId);

    res.json({ success: true, data });

  } catch (err) { next(err); }

});



router.put('/roles/:roleId/permissions', async (req, res, next) => {

  try {

    const data = await service.updateRolePermissions(req.params.roleId, req.body.permissions || []);

    res.json({ success: true, data });

  } catch (err) { next(err); }

});



router.get('/', async (req, res, next) => {

  try {

    const data = await service.list(req.query);

    res.json({ success: true, ...data });

  } catch (err) { next(err); }

});



router.post('/', validate(registerSchema), async (req, res, next) => {

  try {

    const data = await service.create(req.body);

    res.status(201).json({ success: true, data });

  } catch (err) { next(err); }

});



router.post('/purge-demo', async (req, res, next) => {
  try {
    const data = await service.purgeDemoUsers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {

  try {

    const data = await service.update(req.params.id, req.body, req.user.id);

    res.json({ success: true, data });

  } catch (err) { next(err); }

});

router.delete('/:id', async (req, res, next) => {
  try {
    const data = await service.remove(req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;


