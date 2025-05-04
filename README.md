# AIChatBot Project: A RAG-Powered Q&A Assistant

## 📚 What is This?

This is an AI chatbot app that can answer questions about Expo projects using documentation from official sources. Unlike traditional chatbots that might make up answers, this system finds and retrieves real documentation before generating responses.

**Key features:**
- Answers questions with real documentation
- Shows source links so you can read more
- Avoids making up information (hallucination)

## 🧠 How It Works: RAG Explained

**RAG** stands for **Retrieval-Augmented Generation**, a system that combines:

1. **Retrieval** – Pulls relevant information from a knowledge base (like a document store or database) in real time.  
2. **Generation** – Uses a language model (like GPT) to generate a response based on both the user query and the retrieved information.

This approach is powered by *embeddings*, which help the AI understand semantic similarity between user queries and documentation.

### In plain English:

1. You ask a question
2. The system converts your question into a special numeric format (embedding)
3. It searches for documentation with similar numeric patterns
4. It passes the relevant docs to ChatGPT along with your question
5. ChatGPT answers based on this documentation, not its general knowledge
6. You get a precise answer with source links

## 🧮 Simple RAG Flow Diagram
![Simple RAG Flow Diagram](https://github.com/user-attachments/assets/d02332e3-0471-4236-9e89-00890b2d0c80)


---

### 💡 Inspiration

This project was built to:

- Explore how embeddings enable semantic search and relevance.
- Understand systems like **Notebook LM** and how they could be improved.
- Deepen understanding of RAG architecture to support future AI initiatives.

---

## 🔢 What Are Embeddings?

Embeddings are numeric representations of text that allow similarity comparisons between inputs.

**In plain English:** They're like converting words into coordinates on a map. Things with similar meaning end up closer together, so we can find related content by measuring distance.

### Example:

- "How to start a new Expo project" and "Initialize Expo application" have different words, but their embeddings would be very similar because they mean almost the same thing.
- This lets our app find relevant documentation even when the exact words don't match.

**Model used:** `text-embedding-3-small`  
**Vector size:** `1536` (each piece of text becomes a list of 1,536 numbers)

### What an embedding looks like

```json
{
  object: 'embedding',
  index: 0,
  embedding: [
      -0.01473021,   -0.012470182,    0.020506522,  -0.0012408601,
       0.03776156,    -0.03347551, -0.00014904562,   -0.006318226,
     -0.011780473,    0.019939976, -0.00091217074,   -0.012722665,
     0.0046401396,   -0.029066302,      0.0300516,    0.014483886,
     -0.008331929,    -0.02342547,   0.0050835237,     0.02684938,
     // ... 1,526 more numbers
  ]
} 
```

## Simple visualization of how vector matching works

Imagine a simplified 2D version:

```
our_data: [0, 0]   <- This document is at coordinate (0,0)
          [0, 1]   <- This document is at coordinate (0,1)     
          [1, 0]   <- This document is at coordinate (1,0)
          [1, 1]   <- This document is at coordinate (1,1)

user_query: [0, 1] <- User searches for something at coordinate (0,1)
```

In this example, the document at `[0, 1]` would be the closest match to the user's query, so we'd return that document first.

In reality, we use 1,536 dimensions instead of just 2, which allows for much more nuanced matching of concepts.

## 🗄️ Database: How Data Is Stored

We use Supabase – a hosted PostgreSQL database with special features:

- Row-level security
- REST and GraphQL APIs
- Real-time change streams via WebSockets
- Built-in vector similarity search with `pgvector`
- Authentication and object storage

### How We Store Documentation

Each piece of documentation is:
1. Split into chunks
2. Converted to embeddings (those 1,536-number vectors)
3. Stored with its URL and title
4. Made searchable by vector similarity

We use the document's path as its ID to prevent duplicates:

```sql
Error inserting data: {
  code: '23505',
  details: 'Key (id)=(deploy/app-stores-metadata) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "docs_pkey"'
}
```

## 🔍 How Vector Search Works

When searching for similar vectors, `pgvector` supports 3 distance measurements:

| **Operator** | **Description**           |
|--------------|---------------------------|
| `<->`        | Euclidean distance        |
| `<#>`        | Negative inner product    |
| `<=>`        | Cosine distance           |

Our system uses cosine distance (`<=>`) which measures the angle between vectors and works well for text similarity.

### The Function That Handles Search

```sql
create or replace function match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  title text,
  body text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.title,
    documents.body,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by (documents.embedding <=> query_embedding) asc
  limit match_count;
$$;
```

This function:
1. Takes a user's query embedding
2. Compares it to all document embeddings
3. Calculates a similarity score (1.0 = identical, 0.0 = completely different)
4. Returns only documents above a threshold (to ensure relevance)
5. Limits the number of results returned

### In Action: Client-Side Code

```javascript
const { data: documents } = await supabaseClient.rpc('match_documents', {
  query_embedding: embedding, // Pass the embedding you want to compare
  match_threshold: 0.78, // Choose an appropriate threshold for your data
  match_count: 10, // Choose the number of matches
})
```

**Important Note:** You must use embeddings from the same model when calculating distance. Comparing embeddings from different models will produce meaningless results.

## 📱 Sample Response

Here's an example of what happens when a user asks a question:

```javascript
runPrompt("How do we initialize a new project with Expo?")

{
  data: [
    {
      id: 'get-started/set-up-your-environment',
      title: 'Set up your environment',
      url: 'https://docs.expo.dev/get-started/set-up-your-environment',
      similarity: 0.575069257625253
    },
    {
      id: 'get-started/introduction',
      title: 'Introduction',
      url: 'https://docs.expo.dev/get-started/introduction',
      similarity: 0.570675671100621
    }
  ],
  error: null
}
```

The system found these two documents related to the query, with similarity scores of about 0.57 (57% similar). The assistant will use this documentation to craft its response, then include these links so the user can read more.

## 🚀 Use Cases

This RAG architecture can be applied to various domains:

- Customer support systems with accurate product information
- Internal company knowledge bases
- Educational tools for specific subjects
- Medical information assistants
- Legal research assistants

## 🔧 Technical Architecture

1. **Frontend**: React Native/Expo mobile app
2. **Backend**: Supabase Edge Functions
3. **Database**: Supabase PostgreSQL with pgvector
4. **AI**: OpenAI's GPT-4o for generation and text-embedding-3-small for embeddings

When a user asks a question:
1. The query is converted to an embedding
2. Similar documents are retrieved from the database
3. The documents and query are sent to GPT
4. GPT generates a response based only on these documents
5. The response and source links are displayed to the user

## 🧩 AI Generated App Icon
<div align="center">
  <img src="https://github.com/user-attachments/assets/ad63aa6f-3bdd-48a9-94a3-ccdb6132c4e5" alt="icon-2" width="80" />
</div>

## 🎬 Preview
https://github.com/user-attachments/assets/3b375917-da06-4e2e-9966-b59b553d86fa

