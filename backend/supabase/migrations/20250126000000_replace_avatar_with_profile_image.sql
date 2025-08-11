BEGIN;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS profile_img_url TEXT;
CREATE INDEX IF NOT EXISTS idx_agents_profile_img_url ON agents(profile_img_url) WHERE profile_img_url IS NOT NULL;
COMMENT ON COLUMN agents.profile_img_url IS 'URL to agent profile image (uploaded or AI-generated)';

ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS profile_img_url TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_templates_profile_img_url ON agent_templates(profile_img_url) WHERE profile_img_url IS NOT NULL;
COMMENT ON COLUMN agent_templates.profile_img_url IS 'URL to agent template profile image (uploaded or AI-generated)';

DROP INDEX IF EXISTS idx_agents_avatar;
DROP INDEX IF EXISTS idx_agents_avatar_color;
DROP INDEX IF EXISTS idx_agent_templates_avatar;
DROP INDEX IF EXISTS idx_agent_templates_avatar_color;

ALTER TABLE agents DROP COLUMN IF EXISTS avatar;
ALTER TABLE agents DROP COLUMN IF EXISTS avatar_color;
ALTER TABLE agent_templates DROP COLUMN IF EXISTS avatar;
ALTER TABLE agent_templates DROP COLUMN IF EXISTS avatar_color;

UPDATE agents 
SET config = config - 'metadata' || jsonb_build_object(
    'metadata', 
    COALESCE(config->'metadata', '{}'::jsonb) - 'avatar' - 'avatar_color'
)
WHERE config ? 'metadata' 
  AND (
    config->'metadata' ? 'avatar' 
    OR config->'metadata' ? 'avatar_color'
  );

UPDATE agents 
SET config = config - 'metadata'
WHERE config ? 'metadata' 
  AND config->'metadata' = '{}'::jsonb;

COMMIT; 