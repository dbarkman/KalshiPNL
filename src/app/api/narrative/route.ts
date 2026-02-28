import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const prompt = `You are a concise trading performance analyst. Given the following Kalshi prediction market trading data, write a 3-5 paragraph narrative summary of the trader's performance. Be specific with numbers. Call out strengths, weaknesses, patterns, and actionable insights. Keep it direct and useful — no fluff.

Trading Stats:
${JSON.stringify(body, null, 2)}

Write the summary in plain text (no markdown headers, no bullet lists). Use short paragraphs.`;

  try {
    const text = await runClaude(prompt);
    return NextResponse.json({ narrative: text });
  } catch (err) {
    console.error('Claude CLI error:', err);
    return NextResponse.json(
      { error: 'Failed to generate narrative. Make sure the claude CLI is installed and authenticated.' },
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
