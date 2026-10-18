import axios from "axios";

// Backend credentials and Neon connection strings must never be placed here.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  withCredentials: true,
  timeout: 15_000,
});
