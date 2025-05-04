// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import fm from "npm:front-matter@4.0.2";

const openai = new OpenAI();

// On GitHub: https://raw.githubusercontent.com/expo/expo/main/docs/pages/get-started/start-developing.mdx
// Public page: https://docs.expo.dev/get-started/start-developing
export const parseExpoDocs = async (slug: string) => {
  try {
    const url = `https://raw.githubusercontent.com/expo/expo/main/docs/pages/${slug}.mdx`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Error fetching docs from ${url}:`, response.statusText);
      return { body: "" };
    }

    const content = await response.text();
    const data = fm(content);
    return data;
  } catch (err) {
    console.error("parseExpoDocs error:", err);
    return { body: "" };
  }
};

const generateEmbeddings = async (input: string) => {
  try {
    // Generate an embedding vector for the user’s query
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
      encoding_format: "float",
    });
    const vector = embedding.data[0].embedding;
    return vector;
  } catch (err) {
    console.error("OpenAI Embeddings error:", err);
    // Return an empty array so it doesn’t break everything
    return [];
  }
};

const getCompletion = async (prompt: string) => {
  try {
    // Create a chat completion to get an LLM answer
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });
    return response.choices[0];
  } catch (err) {
    console.error("OpenAI Completion error:", err);
    // Return a fallback response if there's an error
    return {
      message: {
        content: "I’m sorry, but I had trouble generating an answer. Please try again.",
      },
    };
  }
};

/**
 * Prompt Engineering Explanation:
 * - The system is told it only knows what's in the "CONTEXT".
 * - If the user’s question can't be answered by the context, it should prompt the user
 *   to clarify or rephrase specifically in the context of Expo.
 * - This ensures the LLM does not hallucinate or go out of scope, and instead guides the user back to the Expo domain.
 */
const buildFullPrompt = (query: string, docsContext: string) => {
  return `
You are an AI specialized in answering questions about Expo projects. 
You have the following CONTEXT as your entire knowledge base. 
If the user asks for anything outside the CONTEXT or the question cannot be answered with the CONTEXT, 
respond with a short clarifying question such as: 
"I’m sorry, but my knowledge is limited to Expo. Could you clarify what you're looking for regarding Expo projects?"
Encourage the user to clarify or rephrase if necessary.

CONTEXT:
${docsContext}

USER QUERY: ${query}

Answer ONLY with information found in CONTEXT. If the information is not found, respond with:
"I’m sorry, but my knowledge is limited to Expo. Could you clarify what you're looking for regarding Expo projects?"

Final Answer:
  `.trim();
};

Deno.serve(async (req) => {
  // Create a Supabase client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const { query } = await req.json();

    // Generate an embedding for the user query
    const vector = await generateEmbeddings(query);

    // Find similar/relevant docs to the user query
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
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // If no relevant docs are returned, handle gracefully by asking the user to clarify
    if (!similarDocs || similarDocs.length === 0) {
      return new Response(
        JSON.stringify({
          message: "I’m sorry, but my knowledge is limited to Expo. Could you clarify what you're looking for regarding Expo projects?",
          docs: [],
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Merge docs into one single string
    const docs = await Promise.all(
      similarDocs.map((doc: any) => parseExpoDocs(doc.id))
    );
    const docsBodies = docs.map((doc) => doc.body || "").join("\n");

    // Build the final prompt
    const filledPrompt = buildFullPrompt(query, docsBodies);

    // Get the completion from OpenAI
    const answer = await getCompletion(filledPrompt);

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
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
