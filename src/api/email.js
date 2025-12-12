import axios from "axios";

const baseUrl = import.meta.env.VITE_BACKEND_URL ?? "https://drawdb-server-production.up.railway.app";


export async function send(subject, message, attachments) {
  return await axios.post(`${baseUrl}/email/send`, {
    subject,
    message,
    attachments,
  });
}
