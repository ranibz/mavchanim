// netlify/functions/mavchan-ai.js
// פונקציה לבניית ובדיקת מבחני בקרה עם Gemini
// גרסה: 1.0.0 | תאריך: 2026-05-05

exports.handler = async function(event, context) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const action = body.action;
    if (!action) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing action' }) };
    }

    let prompt = '';

    if (action === 'generate_test') {
        // בניית מבחן
        const { topic, num_choice, num_open, level } = body;
        if (!topic || topic.length < 10) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'נדרש נושא או טקסט (לפחות 10 תווים)' }) };
        }

        const totalQ = (num_choice || 0) + (num_open || 0);
        if (totalQ === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'נדרשת לפחות שאלה אחת' }) };
        }

        prompt = `אתה מורה בתיכון בישראל הבונה מבחן בדיקת הבנה לתלמידים.

נושא או טקסט המבחן:
"""
${topic}
"""

המשימה: בנה מבחן בעברית עם בדיוק:
- ${num_choice || 0} שאלות בחירה מרובה (4 אפשרויות, תשובה נכונה אחת)
- ${num_open || 0} שאלות פתוחות (הסבר במילים שלך)

הנחיות חשובות:
1. השאלות צריכות לבדוק הבנה אמיתית של הנושא, לא שינון
2. השאלות צריכות להיות ספציפיות לנושא שהוצג
3. השאלות הפתוחות צריכות לחייב את התלמיד להסביר ולנמק
4. בבחירה מרובה - הסחות הדעת חייבות להיות סבירות אבל לא נכונות
5. כתוב את הכל בעברית
${level ? `6. רמת קושי: ${level}` : ''}

החזר JSON תקין בלבד (ללא טקסט נוסף, ללא backticks, ללא הסברים) בדיוק בפורמט הזה:
{
  "questions": [
    {
      "type": "choice",
      "text": "השאלה כאן?",
      "options": ["אופציה 1", "אופציה 2", "אופציה 3", "אופציה 4"],
      "correct_answer": "אופציה 1",
      "points": 5
    },
    {
      "type": "text",
      "text": "השאלה הפתוחה?",
      "points": 10,
      "expected_answer": "תיאור קצר במשפט אחד של מה תשובה טובה אמורה לכלול"
    }
  ]
}`;

    } else if (action === 'grade_answer') {
        // בדיקת תשובה פתוחה
        const { question, expected_answer, student_answer, max_points } = body;
        if (!question || !student_answer) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסרים פרטים' }) };
        }

        prompt = `אתה מורה בתיכון בישראל הבודק תשובה של תלמיד.

השאלה: ${question}
${expected_answer ? `מה התשובה אמורה לכלול: ${expected_answer}` : ''}
תשובת התלמיד:
"""
${student_answer}
"""

המשימה: תן ציון מ-0 עד ${max_points || 10} לתשובת התלמיד והערכה מילולית קצרה.

הנחיות:
1. ציון 0 = לא ענה / תשובה לא קשורה / מוטעית לחלוטין
2. ציון מלא = תשובה מלאה, מדויקת, מנומקת
3. ציון אמצעי = תשובה חלקית - מבין משהו אבל חסר/לא מדויק
4. ההערכה צריכה להיות 1-2 משפטים בעברית
5. תהיה הוגן אבל קפדן - לא לתת ציון מלא לתשובה שטחית

החזר JSON תקין בלבד (ללא טקסט נוסף, ללא backticks):
{
  "score": <מספר>,
  "feedback": "<הערכה מילולית>"
}`;

    } else {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }

    // קריאה ל-Gemini
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Gemini error:', errText);
            return { 
                statusCode: 500, 
                headers, 
                body: JSON.stringify({ error: 'שגיאה בקריאה ל-Gemini', details: errText.substring(0, 500) }) 
            };
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (!text) {
            return { 
                statusCode: 500, 
                headers, 
                body: JSON.stringify({ error: 'תגובה ריקה מ-Gemini' }) 
            };
        }

        // ניסיון לפרסר את ה-JSON
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            // נסיון לחלץ JSON מתוך טקסט
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch (e2) {
                    return { 
                        statusCode: 500, 
                        headers, 
                        body: JSON.stringify({ error: 'לא ניתן לפרסר את התגובה', raw: text.substring(0, 500) }) 
                    };
                }
            } else {
                return { 
                    statusCode: 500, 
                    headers, 
                    body: JSON.stringify({ error: 'אין JSON בתגובה', raw: text.substring(0, 500) }) 
                };
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(parsed)
        };

    } catch (err) {
        console.error('Error:', err);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: 'שגיאה: ' + err.message }) 
        };
    }
};
