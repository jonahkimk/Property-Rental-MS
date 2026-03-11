import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — clear session and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthLogin = url.includes('/auth/login');

    if (status === 401 && !isAuthLogin) {
      localStorage.removeItem('rms_token');
      localStorage.removeItem('rms_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;