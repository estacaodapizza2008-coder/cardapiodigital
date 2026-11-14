const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/cadastrar', authController.cadastrar); // 1º admin: exige SETUP_TOKEN; depois, só admin logado

module.exports = router;
