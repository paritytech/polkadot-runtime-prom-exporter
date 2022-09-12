DROP TABLE runtime_nom_pools_pool_id;

ALTER TABLE runtime_nom_pools_pending_rewards
ADD COLUMN pool integer NULL DEFAULT 0;

ALTER TABLE runtime_nom_pools_members
ADD COLUMN pool integer NULL DEFAULT 0;

ALTER TABLE runtime_nom_pools_total_balance
ADD COLUMN pool integer NULL DEFAULT 0;

ALTER TABLE runtime_nom_pools_total_points
ADD COLUMN pool integer NULL DEFAULT 0;

ALTER TABLE runtime_nom_pools_unbonding_balance
ADD COLUMN pool integer NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS runtime_nom_pools_count (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  poolscount INTEGER  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runtime_nom_pools_members_count (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  memberscount INTEGER  NOT NULL DEFAULT 0
);