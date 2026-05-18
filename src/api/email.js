import axios from "axios";

const baseUrl = import.meta.env.VITE_BACKEND_URL;


export async function send(subject, message, attachments) {
  return await axios.post(`${baseUrl}/email/send`, {
    subject,
    message,
    attachments,
  });
}

