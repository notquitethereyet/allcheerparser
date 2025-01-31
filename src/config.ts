// src/config.ts
export const googleConfig = {
  clientId: import.meta.env.VITE_CLIENT_ID,
};

export const allowedEmails = (
  import.meta.env.VITE_WHITELISTED_EMAILS || ""
).split(",").map((email: string) => email.trim().toLowerCase());

// Debugging the whitelist
// console.log("Whitelisted Emails:", allowedEmails);
