
'use server';
/**
 * @fileOverview This file implements a Genkit flow for AI-based worker video verification.
 * It analyzes an uploaded worker video to detect a face and attempts to verify the worker's
 * identity against associated job card information.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const WorkerVideoVerificationInputSchema = z.object({
  videoDataUri: z
    .string()
    .describe(
      "A 20-second video of the worker, as a data URI that must include a MIME type and use Base64 encoding."
    ),
  workerName: z.string().describe("The worker's full name as per the job card."),
  fatherName: z.string().describe("The worker's father's name as per the job card."),
  jobCardNumber: z.string().describe("The job card number associated with the worker."),
});
export type WorkerVideoVerificationInput = z.infer<typeof WorkerVideoVerificationInputSchema>;

const WorkerVideoVerificationOutputSchema = z.object({
  status: z.enum(['Verified', 'Pending Verification', 'Failed Verification']).describe("The verification status."),
  reason: z.string().describe("A brief explanation for the status."),
  faceDetected: z.boolean().describe("True if a human face was detected."),
});
export type WorkerVideoVerificationOutput = z.infer<typeof WorkerVideoVerificationOutputSchema>;

export async function verifyWorkerVideo(input: WorkerVideoVerificationInput): Promise<WorkerVideoVerificationOutput> {
  return workerVideoVerificationFlow(input);
}

const workerVideoVerificationPrompt = ai.definePrompt({
  name: 'workerVideoVerificationPrompt',
  input: {schema: WorkerVideoVerificationInputSchema},
  output: {schema: WorkerVideoVerificationOutputSchema},
  prompt: `You are an expert in identity verification.
Analyze the video and compare it with the job card details:
Worker Name: {{{workerName}}}
Father's Name: {{{fatherName}}}
Job Card Number: {{{jobCardNumber}}}

Video: {{media url=videoDataUri}}

Instructions:
1. Detect if a human face is clearly visible.
2. Verify if the person matches the context of a worker profile.
3. Be concise in your reasoning.
`,
  model: 'googleai/gemini-2.0-flash-exp', // Use the fastest available model for video analysis
});

const workerVideoVerificationFlow = ai.defineFlow(
  {
    name: 'workerVideoVerificationFlow',
    inputSchema: WorkerVideoVerificationInputSchema,
    outputSchema: WorkerVideoVerificationOutputSchema,
  },
  async (input) => {
    const {output} = await workerVideoVerificationPrompt(input);
    if (!output) {
      throw new Error('Verification failed.');
    }
    return output;
  }
);
