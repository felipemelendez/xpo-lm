// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import fm from "npm:front-matter@4.0.2";

const openai = new OpenAI();

// On github: https://raw.githubusercontent.com/expo/expo/main/docs/pages/get-started/start-developing.mdx
// Public page: https://docs.expo.dev/get-started/start-developing
export const parseExpoDocs = async (slug: string) => {
  const url =
    `https://raw.githubusercontent.com/expo/expo/main/docs/pages/${slug}.mdx`;
  const response = await fetch(url);
  const content = await response.text();

  const data = fm(content);

  return data;
};

const generateEmbeddings = async (imput: string) => {
    // generate vector
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: imput,
        encoding_format: 'float',
    });
    const vector = embedding.data[0].embedding;
    return vector;
}

const completion = async (prompt: string) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.2,
    });
    return response.choices[0];
}

/**
 * Prompt Engineering Explanation:
 * - The system is told it only knows what's in the "CONTEXT".
 * - If the user’s question can't be answered by the context, it must say it doesn't have enough info.
 * - This ensures the LLM does not hallucinate or go out of scope.
 */
const buildFullPrompt = (query: string, docsContext: string) => {
  return `
You are an AI specialized in answering questions about Expo projects. 
You have the following CONTEXT as your entire knowledge base. 
If the user asks for anything outside the CONTEXT or the question cannot be answered with the CONTEXT, 
respond with a short apology like: "I’m sorry, but I don’t have information about that."

CONTEXT:
${docsContext}

USER QUERY: ${query}

Answer ONLY with information found in CONTEXT. If not found, respond with "I’m sorry, but I don’t have information about that."

Final Answer:
  `.trim();
};

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const { query } = await req.json();

    // Generate Embedding for user query
    const vector = await generateEmbeddings(query);

    // Find similar/relevant docs to user query
    const { data: similarDocs, error } = await supabase.rpc("match_documents", {
      query_embedding: vector,
      match_threshold: 0.3,
      match_count: 3,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return new Response(
        JSON.stringify({
          message: "Error matching documents.",
          docs: [],
        }),
        { headers: { "Content-Type": "application/json" }, status: 500 }
      );
    }

    // If no relevant docs are returned, handle gracefully
    if (!similarDocs || similarDocs.length === 0) {
      // Return a "no info" response right away
      return new Response(
        JSON.stringify({
          message:
            "I’m sorry, but I don’t have information about that.",
          docs: [],
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Merge docs into one single string
    const docs = await Promise.all(similarDocs.map((doc: any) => parseExpoDocs(doc.id)));
    const docsBodies = docs.map((doc) => doc.body).join("\n");

    // Build prompt
    const filledPrompt = buildFullPrompt(query, docsBodies);

    // Get completion
    const answer = await completion(filledPrompt);

    const data = {
      message: answer.message.content,
      docs: similarDocs,
    };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Request error:", err);
    return new Response(
      JSON.stringify({
        message: "There was an error processing your request.",
        docs: [],
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/prompt' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
