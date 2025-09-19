import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sqlite3 from 'sqlite3';
// Patched import for pdf-parse to resolve module compatibility issues
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// --- Initialize Express App ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Database Setup (SQLite) ---
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log("Connected to the SQLite database.");
        // **UPDATED SCHEMA:** Added extracted_fields column
        db.run(`CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            content TEXT,
            doc_type TEXT,
            confidence REAL,
            missing_fields TEXT,
            recommendations TEXT,
            extracted_fields TEXT, 
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});


// --- Configure Multer for in-memory file storage ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// --- Regex-Based Analysis Logic ---

const CLASSIFICATION_REGEX = {
    Invoice: [/invoice/i, /bill\s?to/i, /amount\s?due/i, /invoice\s?(number|#)/i],
    Contract: [/agreement/i, /contract/i, /party\s?(a|b|1|2)/i, /terms\s?and\s?conditions/i, /witness/i],
    Report: [/report/i, /analysis/i, /summary/i, /findings/i, /conclusion/i]
};

const MISSING_FIELD_REGEX = {
    'Contract': {
        party_1: /party\s?(a|1)/i,
        party_2: /party\s?(b|2)/i,
        signature: /signature/i,
        date: /(effective\s)?date/i,
        payment_terms: /payment\s?terms/i
    },
    'Invoice': {
        invoice_number: /invoice\s?(number|#|no\.?)/i,
        amount: /(total|amount)\s?due/i,
        due_date: /due\s?date/i,
        tax: /tax|gst|vat/i,
        bill_to: /bill\s?to/i,
        bill_from: /bill\s?from/i
    }
};

// **NEW:** Regex for extracting field values
const EXTRACTION_REGEX = {
    'Invoice': {
        invoice_number: /invoice\s?(?:number|#|no\.?)\s*[:\-]?\s*([A-Z0-9\-]+)/i,
        amount: /(?:total|amount)\s?due\s*[:\-]?\s*[$€£₹]?\s*([\d,]+\.?\d*)/i,
        due_date: /(?:due\s?date)\s*[:\-]?\s*(\w+\s\d{1,2},?\s\d{4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
        bill_to: /bill\s?to\s*:\s*([\s\S]*?)(?=bill\s?from|ship\s?to|notes|terms|$)/i,
    },
    'Contract': {
        party_1: /party\s?(?:a|1)\s*:\s*(.*)/i,
        party_2: /party\s?(?:b|2)\s*:\s*(.*)/i,
        effective_date: /(?:effective\sdate)\s*:\s*(.*)/i,
    }
};


function classifyWithRegex(text) {
    let bestMatch = { type: 'Other', score: 0 };
    for (const type in CLASSIFICATION_REGEX) {
        const score = CLASSIFICATION_REGEX[type].reduce((count, regex) => {
            return count + (regex.test(text) ? 1 : 0);
        }, 0);

        if (score > bestMatch.score) {
            bestMatch = { type, score };
        }
    }
    const confidence = bestMatch.score > 0 ? (bestMatch.score / (bestMatch.score + 3)) : 0.9;
    return { type: bestMatch.type, confidence: parseFloat(confidence.toFixed(2)) };
}

function checkMissingFieldsWithRegex(text, type) {
    const fields_to_check = MISSING_FIELD_REGEX[type];
    if (!fields_to_check) return [];

    const missing = [];
    for (const field in fields_to_check) {
        if (!fields_to_check[field].test(text)) {
            missing.push(field);
        }
    }
    return missing;
}

// **NEW:** Function to extract fields using regex
function extractFieldsWithRegex(text, type) {
    const fields_to_extract = EXTRACTION_REGEX[type];
    if (!fields_to_extract) return {};

    const extracted = {};
    for (const field in fields_to_extract) {
        const match = fields_to_extract[field].exec(text);
        if (match && match[1]) {
            extracted[field] = match[1].trim().replace(/\s+/g, ' ');
        }
    }
    return extracted;
}


function formatExtractedText(text) {
    let formattedText = text.replace(/\s+n\s+/g, '\n');
    formattedText = formattedText.replace(/[ \t]+/g, ' ');
    formattedText = formattedText.replace(/(\r\n|\n|\r){2,}/g, '\n');
    return formattedText.trim();
}

// --- Improvement Recommendations Logic ---

const RECOMMENDATION_TEMPLATES = {
    // Invoice fields
    invoice_number: "Action: Add a unique invoice number (e.g., 'INV-001') for tracking and reference.",
    amount: "Action: Specify the total amount due to ensure correct payment.",
    due_date: "Action: Include a clear due date to avoid late payments.",
    tax: "Action: Detail any applicable taxes (e.g., GST, VAT) or state that taxes are included.",
    bill_to: "Action: Add the recipient's full name and address under a 'Bill To' section.",
    bill_from: "Action: Add the sender's full name and address under a 'Bill From' or company letterhead.",
    // Contract fields
    party_1: "Action: Clearly identify the first party (e.g., 'Party A', 'the Client') with their legal name and address.",
    party_2: "Action: Clearly identify the second party (e.g., 'Party B', 'the Contractor') with their legal name and address.",
    signature: "Action: Add a signature line for all parties to formally execute the agreement.",
    date: "Action: Include the effective date or execution date of the contract.",
    payment_terms: "Action: Specify the payment terms, including amounts, schedule, and method."
};

function generateRecommendations(missingFields) {
    return missingFields.map(field => RECOMMENDATION_TEMPLATES[field] || `Action: Ensure the '${field.replace(/_/g, ' ')}' is included.`);
}


// --- API Routes ---

app.post('/analyze', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }
    try {
        const pdfData = await pdf(req.file.buffer);
        const formattedText = formatExtractedText(pdfData.text);
        
        const classificationResult = classifyWithRegex(formattedText);
        const docType = classificationResult.type;
        const confidence = classificationResult.confidence;
        const missingFields = checkMissingFieldsWithRegex(formattedText, docType);
        const recommendations = generateRecommendations(missingFields);
        const extractedFields = extractFieldsWithRegex(formattedText, docType); // **NEW**

        await new Promise((resolve, reject) => {
            // **UPDATED:** Added extracted_fields to the INSERT statement
            const stmt = `INSERT INTO documents (filename, content, doc_type, confidence, missing_fields, recommendations, extracted_fields) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.run(stmt, [req.file.originalname, formattedText, docType, confidence, JSON.stringify(missingFields), JSON.stringify(recommendations), JSON.stringify(extractedFields)], function(err) {
                if (err) {
                    console.error("Database insertion error:", err.message);
                    return reject(err);
                }
                resolve();
            });
        });

        res.json({
            text: formattedText,
            docType: { type: docType, confidence: confidence },
            missing: { missing_fields: missingFields },
            recommendations: recommendations,
            extractedFields: extractedFields // **NEW**
        });

    } catch (error) {
        console.error("Error during analysis:", error);
        res.status(500).json({ error: "Failed to analyze PDF file." });
    }
});

app.get('/history', (req, res) => {
    const sql = "SELECT id, filename, doc_type, analyzed_at FROM documents ORDER BY analyzed_at DESC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Database select error:", err.message);
            return res.status(500).json({ error: "Failed to retrieve analysis history." });
        }
        res.json(rows);
    });
});

app.get('/history/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM documents WHERE id = ?";
    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error("Database select error:", err.message);
            return res.status(500).json({ error: "Failed to retrieve analysis details." });
        }
        if (row) {
            row.missing_fields = JSON.parse(row.missing_fields || '[]');
            row.recommendations = JSON.parse(row.recommendations || '[]');
            row.extracted_fields = JSON.parse(row.extracted_fields || '{}'); // **NEW**
            res.json(row);
        } else {
            res.status(404).json({ error: "Analysis not found." });
        }
    });
});

app.delete('/history/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM documents WHERE id = ?";
    db.run(sql, [id], function(err) {
        if (err) {
            console.error("Database delete error:", err.message);
            return res.status(500).json({ error: "Failed to delete history item." });
        }
        if (this.changes > 0) {
            res.status(200).json({ message: 'History item deleted successfully.' });
        } else {
            res.status(404).json({ error: 'History item not found.' });
        }
    });
});


// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

