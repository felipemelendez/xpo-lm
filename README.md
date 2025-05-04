### AIChatBot Project (RAG system)

**RAG** stands for **Retrieval-Augmented Generation**, a system that combines:

1. **Retrieval** – Pulls relevant information from a knowledge base (like a document store or database) in real time.  
2. **Generation** – Uses a language model (like GPT) to generate a response based on both the user query and the retrieved information.

This approach is powered by *embeddings*, which help the AI understand semantic similarity between user queries and documentation.

---

### 💡 Inspiration

This project was built to:

- Explore how embeddings enable semantic search and relevance.
- Understand systems like **Notebook LM** and how they could be improved.
- Deepen understanding of RAG architecture to support future AI initiatives.

---

### 🧠 System Overview

![System Diagram](https://via.placeholder.com/800x400?text=System+Diagram) <!-- Replace with actual image URL if hosted -->

---

## 🔢 Embeddings

Embeddings are numeric representations of text that allow similarity comparisons between inputs.

**Model used:** `text-embedding-3-small`  
**Vector size:** `1536`

<details>
<summary>Example output</summary>

```json
{
  "object": "embedding",
  "index": 0,
  "embedding": [
    -0.01473021, -0.012470182, 0.020506522, ...
    // 1,536 float values
  ]
}
```

```json
our_data: [0, 0]
          [0, 1]     user_query: [0, 1]
          [1, 0]
          [1, 1]
```

"""## Database

Supabase – hosted PostgreSQL database with row-level security, REST and GraphQL APIs, real-time change streams via WebSockets, authentication, and object storage—built to streamline the development of scalable full-stack applications.

Note: making slug the id to prevent duplicate files (thank you duplicates tech interview question)

```sql
Error inserting data: {
  code: '23505',
  details: 'Key (id)=(deploy/app-stores-metadata) already exists.',
  hint: null,
  message: 'duplicate key value violates unique constraint "docs_pkey"'
}
```

### Querying a vector / embedding [#](https://supabase.com/docs/guides/ai/vector-columns#querying-a-vector--embedding)

Similarity search is the most common use case for vectors. `pgvector` supports 3 new operators for computing distance:

| **Operator** | **Description**           |
|--------------|---------------------------|
| `<->`        | Euclidean distance        |
| `<#>`        | Negative inner product    |
| `<=>`        | Cosine distance           |

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
This function takes a `query_embedding` argument and compares it to all other embeddings in the `documents` table. Each comparison returns a similarity score. If the similarity is greater than the `match_threshold` argument, it is returned. The number of rows returned is limited by the `match_count` argument.

The `match_threshold` ensures that only documents that have a minimum similarity to the `query_embedding` are returned. Without this, you may end up returning documents that subjectively don't match. This value will vary for each application - you will need to perform your own testing to determine the threshold that makes sense for your app.

If you index your vector column, ensure that the `order by` sorts by the distance function directly (rather than sorting by the calculated `similarity` column, which may lead to the index being ignored and poor performance).

```sql
const { data: documents } = await supabaseClient.rpc('match_documents', {
  query_embedding: embedding, // Pass the embedding you want to compare
  match_threshold: 0.78, // Choose an appropriate threshold for your data
  match_count: 10, // Choose the number of matches
})
```

In this example `embedding` would be another embedding you wish to compare against your table of pre-generated embedding documents. For example if you were building a search engine, every time the user submits their query you would first generate an embedding on the search query itself, then pass it into the above `rpc()` function to match.

Each model has a “unique perspective” of the world

⚠️ Be sure to use embeddings produced from the same embedding model when calculating distance. Comparing embeddings from two different models will produce no meaningful result.

```
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
