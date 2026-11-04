const API_BASE_URL = import.meta.env.VITE_API_URL || "https://floodguard-backend-demo.onrender.com/api";

export async function fetchHistoricalPoints() {
  const res = await fetch(`${API_BASE_URL}/flood-history/points`);
  return res.json();
}

export async function fetchHistoricalBuffers() {
  const res = await fetch(`${API_BASE_URL}/flood-history/buffers`);
  return res.json();
}

export async function fetchHistoricalRadar() {
  const res = await fetch(`${API_BASE_URL}/flood-history/radar`);
  return res.json();
}