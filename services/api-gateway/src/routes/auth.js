import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

export const authRouter = express.Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const result = await query('SELECT * FROM admin_users WHERE email = $1', [email.toLowerCase().trim()]);
  const admin = result.rows[0];

  // Compare against a dummy hash when the user doesn't exist, so login
  // timing doesn't leak whether an email is registered.
  const hashToCompare = admin?.password_hash ?? '$2a$10$invalidsaltinvalidsaltinvalidsa';
  const passwordMatches = await bcrypt.compare(password, hashToCompare);

  if (!admin || !passwordMatches) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  const token = jwt.sign({ sub: admin.id, email: admin.email }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });

  res.json({ token, email: admin.email });
});
