const env = require('../../config/env');
const twilio = require('./twilio.provider');

const providers = { twilio };

const getProvider = () => {
  const name = env.notifications.provider;
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown notification provider: ${name}`);
  return provider;
};

const send = async (payload) => getProvider().send(payload);

module.exports = { send, getProvider };
