CREATE TABLE IF NOT EXISTS pallets_methods_calls (
  time TIMESTAMPTZ NOT NULL,
  section TEXT NOT NULL,
  method TEXT NOT NULL,
  chain TEXT NOT NULL,
  is_signed BOOLEAN NOT NULL,
  calls INTEGER NULL
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS runtime_total_issuance (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  issuance INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_timestamp_seconds (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_weight_to_fee_multiplier (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  weightmultiplier INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_balance_a (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  balance INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_balance_b (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  balance INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_xcm_transfers (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  transferamount DOUBLE NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_finalized_number (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  finalizednumber INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_weight (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  weightclass TEXT NOT NULL,
  weight BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_block_length_bytes (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  blocklength INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_extrinsics_count (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  type TEXT NOT NULL,
  extrinsincscount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_spec_version (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  specname TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_nominator_count (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  nominatorcount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_validator_count (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  validatorcount INTEGER NOT NULL
);

CREATE TABLE annotations_grafana_events (
  time TIMESTAMPTZ NOT NULL,
  timeend TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NULL
);

CREATE TABLE IF NOT EXISTS exporters_versions (
  time TIMESTAMPTZ NOT NULL,
  startingBlock INTEGER NULL,
  endingBlock INTEGER NULL,
  chain TEXT NOT NULL,
  exporter TEXT NOT NULL,
  version INTEGER NULL
);

CREATE TABLE IF NOT EXISTS runtime_nom_pools_pool_id (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  poolid INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_nom_pools_members (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  members INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_nom_pools_total_points (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  totalpoints BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_nom_pools_total_balance (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  totalbalance BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_nom_pools_unbonding_balance (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  unbondingbalance BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_nom_pools_pending_rewards (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  pendingrewards BIGINT NOT NULL
);

