import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: 'http://api:3000/api',
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (error instanceof AxiosError) {
      const { response, message, config } = error;
      console.error(`(${response?.status}) ${message} - ${config?.url}`);
    } else {
      console.error('Unexpected error', error);
    }
    return await Promise.reject(error);
  },
);
