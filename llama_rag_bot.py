import os
import hashlib
import pdfplumber
import faiss
from llama_index.core import (
    SimpleDirectoryReader, VectorStoreIndex,
    Settings, StorageContext, load_index_from_storage
)
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.llama_cpp import LlamaCPP
from llama_index.vector_stores.faiss import FaissVectorStore

# Cache directory for persisted indexes
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".rag_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# ── Globals: loaded once, reused forever ──────────────────────
_llm = None
_embed_model = None


def _ensure_models_loaded():
    """Load LLM and embedding model exactly once."""
    global _llm, _embed_model
    if _embed_model is None:
        print("Loading embedding model...")
        _embed_model = HuggingFaceEmbedding(
            model_name="sentence-transformers/all-mpnet-base-v2"
        )
        Settings.embed_model = _embed_model

    if _llm is None:
        print("Loading LLM (Mistral 7B GGUF)...")
        _llm = LlamaCPP(
            model_path=os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "mistral-7b-instruct-v0.2.Q4_K_M.gguf"
            ),
            temperature=0.1,
            max_new_tokens=256,
            context_window=3900,
            generate_kwargs={},
            model_kwargs={"n_gpu_layers": -1},
            verbose=False,  # less noise
        )
        Settings.llm = _llm


# ── STEP 1: Extract text ───────────────────────────────────────
def extract_text_from_pdf(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            pg = page.extract_text()
            if pg:
                text += pg + "\n"
    return text


# ── STEP 2: Build or load cached FAISS index ──────────────────
def _cache_key(pdf_path):
    """Hash the PDF file content for cache invalidation."""
    h = hashlib.md5()
    with open(pdf_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_rag_index(pdf_path):
    _ensure_models_loaded()

    cache_key  = _cache_key(pdf_path)
    cache_path = os.path.join(CACHE_DIR, cache_key)

    # ── Try loading from disk cache ──
    if os.path.isdir(cache_path):
        print(f"Loading cached index from {cache_path} ...")
        try:
            faiss_index  = faiss.read_index(os.path.join(cache_path, "faiss.index"))
            vector_store = FaissVectorStore(faiss_index=faiss_index)
            storage_ctx  = StorageContext.from_defaults(
                vector_store=vector_store,
                persist_dir=cache_path
            )
            index = load_index_from_storage(storage_ctx)
            print("Loaded index from cache ✓")
            return index
        except Exception as e:
            print(f"Cache load failed ({e}), rebuilding...")

    # ── Build fresh index ──
    print("Reading PDF...")
    pdf_text = extract_text_from_pdf(pdf_path)

    txt_path = os.path.join(CACHE_DIR, "extracted.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(pdf_text)

    print("Loading documents...")
    documents = SimpleDirectoryReader(input_files=[txt_path]).load_data()

    print("Building FAISS index...")
    faiss_index  = faiss.IndexFlatL2(768)  # all-mpnet-base-v2 = 768 dims
    vector_store = FaissVectorStore(faiss_index=faiss_index)
    storage_ctx  = StorageContext.from_defaults(vector_store=vector_store)

    index = VectorStoreIndex.from_documents(documents, storage_context=storage_ctx)

    # ── Persist to disk ──
    os.makedirs(cache_path, exist_ok=True)
    index.storage_context.persist(persist_dir=cache_path)
    faiss.write_index(faiss_index, os.path.join(cache_path, "faiss.index"))
    print(f"Index cached at {cache_path} ✓")

    return index


# ── STEP 3: Query ──────────────────────────────────────────────
def ask_bot(index, question):
    query_engine = index.as_query_engine()
    return query_engine.query(question)


# ── CLI entry point ────────────────────────────────────────────
if __name__ == "__main__":
    index = build_rag_index("parallel_programs.pdf")
    while True:
        q = input("Ask something: ")
        if not q.strip():
            print("Please enter a valid question.")
            continue
        print("\nBot:", ask_bot(index, q))


