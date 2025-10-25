import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    // Generate ephemeral client token
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate token: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Return the ephemeral token (starts with "ek_")
    res.status(200).json({ 
      token: data.value,
      expiresIn: "1 hour" // Ephemeral tokens typically expire in 1 hour
    });
  } catch (error) {
    console.error("Failed to generate ephemeral token:", error);
    res.status(500).json({ 
      error: "Failed to generate token",
      message: (error as Error).message 
    });
  }
}
