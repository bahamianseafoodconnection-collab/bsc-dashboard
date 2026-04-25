// File: app/api/ai/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
try {
const body = await request.json();

if (!process.env.ANTHROPIC_API_KEY) {
return NextResponse.json(
{ error: "API key not configured" },
{ status: 500 }
);
}

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"Content-Type": "application/json",
"x-api-key": process.env.ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01",
},
body: JSON.stringify({
model: "claude-sonnet-4-6",
max_tokens: 1000,
system: body.system,
messages: body.messages,
}),
});

if (!response.ok) {
const errText = await response.text();
return NextResponse.json(
{ error: "Anthropic error: " + errText },
{ status: response.status }
);
}

const data = await response.json();
return NextResponse.json(data);
} catch (error) {
return NextResponse.json(
{ error: "Server error" },
{ status: 500 }
);
}
}
