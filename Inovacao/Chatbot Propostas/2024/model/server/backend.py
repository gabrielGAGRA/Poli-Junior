import os
import time
from datetime import datetime
from dotenv import load_dotenv
from flask import request
from requests import get
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec

# Load environment variables from .env file
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../.env'))
load_dotenv(dotenv_path)

class Backend_Api:
    def __init__(self, app, config: dict) -> None:
        self.app = app
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.pinecone_api_key = os.getenv("PINECONE_API_KEY")
        
        pc = Pinecone(
            api_key=self.pinecone_api_key
        )

        # Connect to the existing index
        self.pinecone_index = pc.Index('propostas-comerciais')  # Save as instance attribute
        
        # Load local embedding model
        self.embedding_model = SentenceTransformer('sentence-transformers/nli-bert-large')
        
        self.proxy = config.get("proxy")
        self.routes = {
            "/backend-api/v2/conversation": {
                "function": self._conversation,
                "methods": ["POST"]
            }
        }
        
        # Model configuration
        self.generation_config = {
            "temperature": 1.2,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 8192,
            "response_mime_type": "text/plain",
        }

    def encode_message(self, message: str):
        """
        Encodes the input message using the local embedding model.
        """
        return self.embedding_model.encode(message).tolist()

    def query_pinecone(self, query_embedding, top_k=5):
        """
        Queries Pinecone database using the provided embedding.
        """
        try:
            results = self.pinecone_index.query(
                vector=query_embedding,
                top_k=top_k,
                include_metadata=True
            )
            return results["matches"]
        except Exception as e:
            print(f"Pinecone query failed: {e}")
            return []

    def send_message(self, message):
        """
        Generates a response after enriching with Pinecone results.
        """
        try:
            # Encode the message into an embedding
            query_embedding = self.encode_message(message)
            print('encoded')
            
            # Query Pinecone
            pinecone_results = self.query_pinecone(query_embedding)
            print('queried')
            
            # Debug: Print a sample of the results structure
            if pinecone_results:
                print(f"First result metadata structure: {pinecone_results[0].get('metadata', {})}")
            
            # Construct a context string from Pinecone results with safety checks
            context_items = []
            for match in pinecone_results:
                if "metadata" in match and "summary" in match["metadata"]:
                    context_items.append(f"- {match['metadata']['summary']}")
            
            pinecone_context = "\n".join(context_items)
            print('context')
    
            # Combine the Pinecone context with the original message
            enriched_message = f"Contexto dos dados:\n{pinecone_context}\n\nPergunta original:\n{message}"
            print('enriched')
            
            # Simulate AI response
            response_text = f"{enriched_message}"
            return response_text
        except Exception as e:
            print(f"Error in send_message: {e}")
            return "Erro ao processar a mensagem."

    def _conversation(self):
        """
        Handles conversation requests.
        """
        try:
            prompt = request.json["meta"]["content"]["parts"][0]
            response = self.send_message(prompt["content"])
            if not response:
                return {"success": False, "message": "Failed to process request"}, 500
            return {"success": True, "response": response}, 200
        except Exception as e:
            print(e)
            return {"success": False, "error": str(e)}, 400