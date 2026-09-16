const FEATURE_BREEDER_DASHBOARD = 'breeder_dashboard';

/** Typical gestation (days) used only to suggest expected birth date. */
const GESTATION_DAYS = {
  camel: 390,
  horse: 340,
  sheep: 147,
  goat: 150,
  cow: 283,
  cattle: 283,
  buffalo: 310,
};

const BREEDING_TYPES = ['natural', 'ai', 'embryo'];
const BREEDING_OUTCOMES = ['pending', 'pregnant', 'not_pregnant', 'aborted', 'born'];
const GENDERS = ['male', 'female', 'unknown'];
const NOTE_KINDS = ['health', 'extra'];

module.exports = {
  FEATURE_BREEDER_DASHBOARD,
  GESTATION_DAYS,
  BREEDING_TYPES,
  BREEDING_OUTCOMES,
  GENDERS,
  NOTE_KINDS,
};
