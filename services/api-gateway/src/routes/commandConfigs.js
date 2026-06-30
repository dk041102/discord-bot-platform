import express from 'express';
import { query } from '../db/pool.js';

export const commandConfigsRouter = express.Router();

/**
 * GET /command-configs?guild_id=<uuid> — list the editable rules for every
 * command in a guild. This backs the "configurable command rules in the UI"
 * stretch goal: enabled/disabled, the reply template, whether to mirror,
 * whether to run AI triage.
 */
commandConfigsRouter.get('/', async (req, res) => {
  const { guild_id } = req.query;
  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id query param is required' });
  }

  const result = await query(
    'SELECT * FROM command_configs WHERE guild_id = $1 ORDER BY command_name',
    [guild_id],
  );
  res.json({ configs: result.rows });
});

/**
 * PATCH /command-configs/:id — update one command's rules. Partial updates:
 * only fields present in the body are changed, so the dashboard can save a
 * single toggle without resending the whole object.
 */
commandConfigsRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = ['enabled', 'reply_template', 'mirror_enabled', 'ai_triage_enabled', 'rule_config'];
  const updates = [];
  const params = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      params.push(field === 'rule_config' ? JSON.stringify(req.body[field]) : req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'no valid fields to update' });
  }

  params.push(id);
  const result = await query(
    `UPDATE command_configs SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'command config not found' });
  }

  res.json({ config: result.rows[0] });
});
