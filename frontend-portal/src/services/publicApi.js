import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const publicApi = {
  catalog: () => axios.get(`${API_URL}/public/catalog`).then((r) => r.data?.data),
  lab: () => axios.get(`${API_URL}/public/lab`).then((r) => r.data?.data),
};
