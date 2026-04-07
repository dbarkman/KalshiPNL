import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { stats, messages } = body;

  // Build conversation for the CLI
  const systemContext = `You are a concise trading performance analyst for Kalshi prediction markets. You have access to the following trading data. Answer questions specifically using the numbers. Be direct and useful — no fluff. Keep responses to 2-3 short paragraphs max.

Trading Stats:
${JSON.stringify(stats, null, 2)}`;

  // Build the full prompt with conversation history
  const conversationParts = [systemContext, ''];
  for (const msg of messages) {
    if (msg.role === 'user') {
      conversationParts.push(`User: ${msg.content}`);
    } else {
      conversationParts.push(`Assistant: ${msg.content}`);
    }
  }

  const prompt = conversationParts.join('\n\n');

  try {
    const text = await runClaude(prompt);
    return NextResponse.json({ narrative: text });
  } catch (err) {
    console.error('Claude CLI error:', err);
    return NextResponse.json(
      { error: 'Failed to generate response. Make sure the claude CLI is installed and authenticated.' },
      { status: 500 },
    );
  }
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/Users/david/.local/bin' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err: Error) => {
      reject(err);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
