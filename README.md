RAG Chatbot (PDF Q&A) using LlamaIndex + FAISS + Llama 3.1

🚀 Overview

This project is a Retrieval-Augmented Generation (RAG) chatbot that:

Reads PDF notes
Converts them into embeddings
Stores them using FAISS
Uses an LLM (Llama 3.1 / HuggingFace models) to answer questions

🧠 Tech Stack

Python
LlamaIndex (v0.14.10)
FAISS (vector database)
HuggingFace Transformers
Sentence Transformers (embeddings)
pdfplumber (PDF parsing)

📂 Project Structure

RAG chatbot/
│
├── llama_rag_bot.py        # Main chatbot script
├── parallel_programs.pdf   # Input PDF
├── notes.txt               # Extracted text (auto-generated)
├── rag_env/                # Virtual environment
└── README.md               # This file


⚙️ Setup Instructions

1️⃣ Create Virtual Environment

python -m venv rag_env

rag_env\Scripts\activate

2️⃣ Install Dependencies

pip install llama-index transformers sentence-transformers pdfplumber faiss-cpu huggingface_hub

3️⃣ Login to HuggingFace

huggingface-cli login

👉 Paste your HF token (it will be invisible while typing)

4️⃣ (Optional) Clone Llama 3.1 Model
git lfs install
git clone https://huggingface.co/meta-llama/Llama-3.1-8B

⚠️ Requires:

16GB RAM (minimum)
or GPU for better performance
▶️ Running the Chatbot
python llama_rag_bot.py

You will see:

Ask something:

Example:

Ask something: What is parallel programming?

🧩 How It Works

📄 PDF → Text extraction

✂️ Text → Chunks

🔢 Chunks → Embeddings (SentenceTransformers)

🧠 Stored in FAISS vector database

🔍 Query → Similar chunks retrieved

🤖 LLM generates final answer
