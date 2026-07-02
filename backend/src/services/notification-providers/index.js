const env = require('../../config/env');
const twilio = require('./twilio.provider');
const msegat = require('./msegat.provider');
const email = require('./email.provider');

const providers = { twilio, msegat, email };

const send = async (payload) => {
  if (payload.channel === 'email') {
    return email.send(payload);
  }
  if (payload.channel === 'whatsapp') {
    return twilio.send(payload);
  }
  if (payload.channel === 'sms' && env.notifications.provider === 'msegat') {
    return msegat.send(payload);
  }
  return getProvider().send(payload);
};

const getProvider = () => {
  const name = env.notifications.provider;
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown notification provider: ${name}`);
  return provider;
};

module.exports = { send, getProvider };
