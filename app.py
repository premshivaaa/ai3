from flask import Flask, render_template, request, jsonify, session
import os
import requests
import random
import json
from datetime import datetime
import google.generativeai as genai
from dotenv import load_dotenv
import urllib.parse

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'default-secret-key')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
FOURSQUARE_API_KEY = os.getenv('FOURSQUARE_API_KEY')

if not FOURSQUARE_API_KEY:
    print("Warning: FOURSQUARE_API_KEY not set")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

# Predefined questions as fallback
FALLBACK_QUESTIONS = [
    {
        "question": "Which country has the longest coastline in the world?",
        "options": ["Russia", "Canada", "Norway", "Australia"],
        "correct_answer": "Canada",
        "hint": "This country is in North America and has over 200,000 km of coastline.",
        "difficulty": "medium"
    },
    {
        "question": "What is the capital of Brazil?",
        "options": ["Rio de Janeiro", "São Paulo", "Brasília", "Salvador"],
        "correct_answer": "Brasília",
        "hint": "This planned city became the capital in 1960.",
        "difficulty": "easy"
    },
    {
        "question": "Which desert is the largest in the world?",
        "options": ["Sahara", "Arabian", "Gobi", "Antarctic"],
        "correct_answer": "Antarctic",
        "hint": "It's located at the southernmost continent.",
        "difficulty": "hard"
    },
    {
        "question": "Which continent contains the most fresh water?",
        "options": ["North America", "Asia", "Africa", "Antarctica"],
        "correct_answer": "Antarctica",
        "hint": "About 70% of the world's fresh water is frozen here.",
        "difficulty": "hard"
    }
]

def init_session():
    if 'score' not in session:
        session['score'] = 0
    if 'total_questions' not in session:
        session['total_questions'] = 0
    if 'history' not in session:
        session['history'] = []
    if 'current_question' not in session:
        session['current_question'] = None
    if 'used_questions' not in session:
        session['used_questions'] = []

def generate_question(difficulty):
    try:
        prompt = f"""
        Generate a unique world geography multiple-choice question with these requirements:
        - Difficulty level: {difficulty}
        - 1 correct answer and 3 plausible incorrect answers
        - Include a brief hint
        - Format as valid JSON with these exact keys:
        {{
            "question": "question text",
            "options": ["option1", "option2", "option3", "option4"],
            "correct_answer": "correct option",
            "hint": "helpful hint",
            "difficulty": "{difficulty}"
        }}
        Return ONLY the JSON object, no additional text or markdown.
        Make sure the options are clear and distinct from each other.
        """
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Clean response text
        if response_text.startswith('```json'):
            response_text = response_text[7:-3].strip()
        elif response_text.startswith('```'):
            response_text = response_text[3:-3].strip()
        
        question_data = json.loads(response_text)
        
        # Validate response
        required_keys = ['question', 'options', 'correct_answer', 'hint', 'difficulty']
        if not all(key in question_data for key in required_keys):
            raise ValueError("Missing required fields in response")
        
        if len(question_data['options']) != 4:
            raise ValueError("Exactly 4 options required")
            
        if question_data['correct_answer'] not in question_data['options']:
            raise ValueError("Correct answer must be one of the options")
            
        if question_data['question'] in session.get('used_questions', []):
            raise ValueError("Duplicate question generated")
        
        # Shuffle options while keeping track of correct answer
        options = question_data['options'].copy()
        correct_answer = question_data['correct_answer']
        random.shuffle(options)
        
        # Update the question data with shuffled options
        question_data['options'] = options
            
        return question_data
        
    except Exception as e:
        print(f"Error generating question with Gemini: {str(e)}")
        # Fallback to predefined questions
        available_questions = [q for q in FALLBACK_QUESTIONS 
                            if q['question'] not in session.get('used_questions', [])]
        
        if available_questions:
            question = random.choice(available_questions)
            # Shuffle options for fallback questions too
            options = question['options'].copy()
            random.shuffle(options)
            question['options'] = options
            return question
        else:
            # If all fallbacks used, reset and reuse
            session['used_questions'] = []
            question = random.choice(FALLBACK_QUESTIONS)
            options = question['options'].copy()
            random.shuffle(options)
            question['options'] = options
            return question

def get_location_image(query):
    if not FOURSQUARE_API_KEY:
        return None
        
    try:
        # Clean and prepare the query
        query = query.strip()
        # URL encode the query
        encoded_query = urllib.parse.quote(f"{query} landmark location")
        
        url = f"https://api.foursquare.com/v3/places/search?query={encoded_query}&limit=1"
        headers = {
            "Accept": "application/json",
            "Authorization": FOURSQUARE_API_KEY
        }
        
        # Make the initial search request
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"Error in Foursquare search: {str(e)}")
            return None

        if not data.get('results') or len(data['results']) == 0:
            return None

        # Get place photos
        try:
            place_id = data['results'][0]['fsq_id']
            photo_url = f"https://api.foursquare.com/v3/places/{place_id}/photos?limit=1"
            photo_response = requests.get(photo_url, headers=headers, timeout=5)
            photo_response.raise_for_status()
            photos = photo_response.json()
        except Exception as e:
            print(f"Error fetching photos: {str(e)}")
            return None

        if photos and len(photos) > 0:
            photo = photos[0]
            # Use a smaller image size for faster loading
            return f"{photo['prefix']}300x300{photo['suffix']}"
            
        return None
        
    except Exception as e:
        print(f"Error in get_location_image: {str(e)}")
        return None

def get_default_image(query):
    # Return appropriate default images based on the type of location
    query_lower = query.lower()
    if any(word in query_lower for word in ['ocean', 'sea', 'pacific', 'atlantic']):
        return "/static/images/ocean.jpg"
    elif any(word in query_lower for word in ['mountain', 'mount', 'mt']):
        return "/static/images/mountain.jpg"
    elif any(word in query_lower for word in ['desert', 'sahara']):
        return "/static/images/desert.jpg"
    elif any(word in query_lower for word in ['forest', 'jungle']):
        return "/static/images/forest.jpg"
    elif any(word in query_lower for word in ['city', 'capital']):
        return "/static/images/city.jpg"
    else:
        return "/static/images/globe.jpg"

@app.route('/')
def home():
    session.clear()
    init_session()
    return render_template('index.html')

@app.route('/get_question', methods=['GET'])
def get_question():
    try:
        init_session()
        
        # Determine difficulty based on score
        difficulty = 'easy'
        if session.get('score', 0) >= 5:
            difficulty = 'hard'
        elif session.get('score', 0) >= 2:
            difficulty = 'medium'
        
        # Generate question with retries
        max_retries = 3
        question_data = None
        
        for attempt in range(max_retries):
            try:
                question_data = generate_question(difficulty)
                if question_data:
                    break
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:
                    raise

        if not question_data:
            raise Exception("Failed to generate question after retries")

        # Track used questions
        session['used_questions'] = session.get('used_questions', []) + [question_data['question']]
        
        # Get image URL - do this before storing in session
        image_url = get_location_image(question_data['correct_answer'])
        
        # Store current question
        session['current_question'] = {
            **question_data,
            'image_url': image_url,
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify({
            'question': question_data['question'],
            'options': question_data['options'],
            'hint': question_data['hint'],
            'image': image_url,
            'difficulty': question_data['difficulty']
        })
        
    except Exception as e:
        print(f"Error in get_question: {str(e)}")
        return jsonify({
            'error': 'Failed to generate question',
            'fallback': True
        }), 500

@app.route('/check_answer', methods=['POST'])
def check_answer():
    try:
        init_session()
        data = request.get_json()
        
        if not data or 'answer' not in data:
            return jsonify({'error': 'Invalid request data'}), 400
            
        user_answer = data['answer']
        current_question = session.get('current_question')
        
        if not current_question:
            return jsonify({'error': 'No active question'}), 400
        
        is_correct = user_answer == current_question['correct_answer']
        
        # Update score
        if is_correct:
            session['score'] = session.get('score', 0) + 1
        session['total_questions'] = session.get('total_questions', 0) + 1
        
        # Add to history
        history_entry = {
            'question': current_question['question'],
            'user_answer': user_answer,
            'correct_answer': current_question['correct_answer'],
            'is_correct': is_correct,
            'difficulty': current_question['difficulty'],
            'timestamp': current_question['timestamp']
        }
        session['history'] = session.get('history', []) + [history_entry]
        
        return jsonify({
            'is_correct': is_correct,
            'correct_answer': current_question['correct_answer'],
            'score': session['score'],
            'total_questions': session['total_questions'],
            'new_difficulty': 'hard' if session['score'] > 5 else 'medium' if session['score'] > 2 else 'easy'
        })
        
    except Exception as e:
        print(f"Error in check_answer: {str(e)}")
        return jsonify({'error': 'Failed to check answer'}), 500

@app.route('/get_history', methods=['GET'])
def get_history():
    try:
        init_session()
        return jsonify({
            'history': session.get('history', []),
            'score': session.get('score', 0),
            'total_questions': session.get('total_questions', 0)
        })
    except Exception as e:
        print(f"Error in get_history: {str(e)}")
        return jsonify({'error': 'Failed to get history'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
