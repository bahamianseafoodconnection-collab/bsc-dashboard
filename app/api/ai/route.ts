// File: app/api/ai/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
try {
const body = await request.json();

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"Content-Type": "application/json",
"x-api-key": process.env.ANTHROPIC_API_KEY || "",
"anthropic-version": "2023-06-01",
},
body: JSON.stringify({
model: "claude-sonnet-4-20250514",
max_tokens: 1000,
system: body.system,
messages: body.messages,
}),
});

const data = await response.json();
return NextResponse.json(data);
} catch (error) {
return NextResponse.json(
{ error: "AI request failed" },
{ status: 500 }
);
}
}
