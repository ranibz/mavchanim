// netlify/functions/mavchan-ai.js
// גרסה: 2.1.0 | תאריך: 2026-05-05 - עם דיבוג

exports.handler = async function(event, context) {
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

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured', debug: 'no_api_key' }) };
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON', debug: e.message }) };
        }

        const action = body.action;
        if (!action) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing action' }) };
        }

        let prompt = '';

        if (action === 'generate_test') {
            const concepts = body.concepts;
            const num_choice = body.num_choice;
            const num_open = body.num_open;
            const additional_topic = body.additional_topic;
            
            if (!concepts || !Array.isArray(concepts) || !concepts.length) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'נדרשים מושגים מתכנית הלימודים' }) };
            }

            const totalQ = (num_choice || 0) + (num_open || 0);
            if (totalQ === 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'נדרשת לפחות שאלה אחת' }) };
            }

            let conceptsList = '';
            concepts.forEach(function(c, i) {
                conceptsList += '\n' + (i+1) + '. **' + c.concept + '** (' + c.arena + ')\n   הגדרה: ' + c.definition + '\n';
            });

            prompt = 'אתה מורה לתקשורת בתיכון בישראל הבונה מבחן בדיקת הבנה לתלמידים.\n\n' +
                'המבחן חייב להיות מבוסס על המושגים הבאים מתכנית הלימודים תשפ"ו (האגרון הרשמי):\n' +
                conceptsList + '\n' +
                (additional_topic ? 'הקשר נוסף: ' + additional_topic + '\n' : '') + '\n' +
                'המשימה: בנה מבחן בעברית עם בדיוק:\n' +
                '- ' + (num_choice || 0) + ' שאלות בחירה מרובה (4 אפשרויות, תשובה נכונה אחת)\n' +
                '- ' + (num_open || 0) + ' שאלות פתוחות (הסבר במילים שלך)\n\n' +
                'הנחיות חשובות:\n' +
                '1. **חובה: כל שאלה חייבת להיות מבוססת על אחד מהמושגים שנמסרו לעיל - אל תמציא תוכן חדש**\n' +
                '2. השאלות צריכות לבדוק הבנה אמיתית של המושגים, לא שינון\n' +
                '3. בשאלות פתוחות - שאל את התלמיד להסביר את המושג, לתת דוגמה, או ליישם אותו\n' +
                '4. בבחירה מרובה - הסחות הדעת חייבות להיות סבירות אבל לא נכונות\n' +
                '5. כתוב את הכל בעברית, השתמש בפירושים שניתנו כסטנדרט לתשובה הנכונה\n' +
                '6. גוון בין המושגים - אל תשאל את כל השאלות על מושג אחד\n\n' +
                'החזר JSON תקין בלבד (ללא טקסט נוסף, ללא backticks):\n' +
                '{\n' +
                '  "questions": [\n' +
                '    {"type": "choice", "text": "השאלה?", "options": ["1","2","3","4"], "correct_answer": "1", "points": 5, "based_on_concept": "שם המושג"},\n' +
                '    {"type": "text", "text": "השאלה?", "points": 10, "expected_answer": "תיאור קצר", "based_on_concept": "שם המושג"}\n' +
                '  ]\n' +
                '}';

        } else if (action === 'grade_answer') {
            const question = body.question;
            const expected_answer = body.expected_answer;
            const student_answer = body.student_answer;
            const max_points = body.max_points;
            const concept_name = body.concept_name;
            const concept_definition = body.concept_definition;
            
            if (!question || !student_answer) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסרים פרטים', debug: { hasQuestion: !!question, hasAnswer: !!student_answer } }) };
            }

            prompt = 'אתה מורה לתקשורת בתיכון בישראל הבודק תשובה של תלמיד.\n\n' +
                'השאלה: ' + question + '\n\n' +
                (concept_name && concept_definition ? 
                    'המושג שעליו השאלה: **' + concept_name + '**\nההגדרה הרשמית מתכנית הלימודים: ' + concept_definition + '\n\n' : '') +
                (expected_answer ? 'מה התשובה אמורה לכלול: ' + expected_answer + '\n\n' : '') +
                'תשובת התלמיד:\n"""\n' + student_answer + '\n"""\n\n' +
                'המשימה: תן ציון מ-0 עד ' + (max_points || 10) + ' לתשובת התלמיד.\n\n' +
                'הנחיות הציון:\n' +
                '1. **השווה את התשובה להגדרה הרשמית** - האם התלמיד הבין את המושג?\n' +
                '2. ציון 0 = לא ענה / תשובה לא קשורה / מוטעית לחלוטין\n' +
                '3. ציון מלא = תשובה מלאה, מדויקת, מנומקת\n' +
                '4. ציון אמצעי = תשובה חלקית\n' +
                '5. ההערכה צריכה להיות 1-2 משפטים בעברית\n' +
                '6. תהיה הוגן אבל קפדן\n\n' +
                'החזר JSON תקין בלבד:\n' +
                '{"score": <מספר>, "feedback": "<הערכה מילולית>"}';

        } else {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
        }

        // קריאה ל-Gemini
        const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return { 
                statusCode: 500, 
                headers, 
                body: JSON.stringify({ 
                    error: 'שגיאה בקריאה ל-Gemini', 
                    statusCode: response.status,
                    details: errText.substring(0, 1000) 
                }) 
            };
        }

        const data = await response.json();
        const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '';
        
        if (!text) {
            return { 
                statusCode: 500, 
                headers, 
                body: JSON.stringify({ 
                    error: 'תגובה ריקה מ-Gemini',
                    raw_response: JSON.stringify(data).substring(0, 1000)
                }) 
            };
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try { parsed = JSON.parse(match[0]); }
                catch (e2) {
                    return { 
                        statusCode: 500, 
                        headers, 
                        body: JSON.stringify({ 
                            error: 'לא ניתן לפרסר את התגובה', 
                            raw: text.substring(0, 1000) 
                        }) 
                    };
                }
            } else {
                return { 
                    statusCode: 500, 
                    headers, 
                    body: JSON.stringify({ 
                        error: 'אין JSON בתגובה', 
                        raw: text.substring(0, 1000) 
                    }) 
                };
            }
        }

        return { statusCode: 200, headers, body: JSON.stringify(parsed) };

    } catch (err) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ 
                error: 'שגיאה כללית: ' + err.message,
                stack: err.stack ? err.stack.substring(0, 1000) : 'no stack'
            }) 
        };
    }
};
