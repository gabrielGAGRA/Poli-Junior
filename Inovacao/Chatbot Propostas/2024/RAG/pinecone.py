# embed_file.py

import pinecone
import os
from sentence_transformers import SentenceTransformer
from embed_file import embeddings

# Initialize embedding model
model = SentenceTransformer('sentence-transformers/nli-bert-large')

# Read the file to embed

# file_path = 'path/to/your/file.txt'


with open(file_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Generate embeddings
embeddings = model.encode(content)

# upload_to_pinecone.py
# Initialize Pinecone
pinecone.init(api_key='YOUR_PINECONE_API_KEY', environment='us-west1-gcp')  # Replace with your environment

# Create or connect to an index
index_name = 'gemini-index'
if index_name not in pinecone.list_indexes():
    pinecone.create_index(index_name, dimension=len(embeddings))

index = pinecone.Index(index_name)

# Prepare data for upload
vector_id = 'unique-vector-id'  # Replace with a unique ID
vector = embeddings.tolist()

# Upsert the vector
index.upsert([(vector_id, vector)])