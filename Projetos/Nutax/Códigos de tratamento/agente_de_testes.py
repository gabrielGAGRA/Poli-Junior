from dotenv import load_dotenv
from openai import OpenAI
import os
import time

# Load environment variables
load_dotenv()

# Initialize OpenAI client with API key
client = OpenAI()

# Assistant ID to use
assistant_id = "asst_B4dII9PiftBNCzojEkc8NagJ"

chat_history = []

# Custom function to calculate the sum of ICMS
def soma_coluna(base, coluna):
    # Verifica se a coluna existe em todos os itens do JSON e faz a soma
    return sum(item.get(coluna, 0) for item in base)

# Define tools list


if __name__ == '__main__':
    try:
        # Create a new thread
        thread = client.beta.threads.create()
        thread_id = thread.id

        while True:
            user_input = input("Você: ")
            if user_input.lower() == 'exit':
                break

            # Send the user's message to the assistant
            client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=user_input
            )


            # Create a new run for the assistant
            run = client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=assistant_id,
            instructions="You are an assistant specialized in providing insights about fiscal files. Be concise but also capable of offering analytical insights on the data.",
        )


            # Poll for the completion status
            while run.status != 'completed':
                time.sleep(2)
                run = client.beta.threads.runs.retrieve(
                    thread_id=thread_id,
                    run_id=run.id
                )

            # Retrieve and display the assistant's response
            messages = client.beta.threads.messages.list(thread_id=thread_id)
            assistant_messages_for_run = [
                message for message in messages.data
                if message.run_id == run.id and message.role == "assistant"
            ]

            for msg in assistant_messages_for_run:
                print(f"Assistant: {msg.content[0].text.value}")

            # Store chat history for reference
            chat_history.append(user_input)
            for msg in assistant_messages_for_run:
                chat_history.append(msg.content[0].text.value)

    except Exception as e:
        print(f"An error occurred: {e}")
