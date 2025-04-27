document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const elements = {
        startButton: document.getElementById('start-button'),
        nextButton: document.getElementById('next-button'),
        hintButton: document.getElementById('hint-button'),
        questionContainer: document.getElementById('question-container'),
        resultContainer: document.getElementById('result-container'),
        startContainer: document.getElementById('start-container'),
        questionText: document.getElementById('question-text'),
        optionsContainer: document.getElementById('options-container'),
        hintText: document.getElementById('hint-text'),
        resultText: document.getElementById('result-text'),
        scoreDisplay: document.getElementById('score'),
        totalQuestionsDisplay: document.getElementById('total-questions'),
        historyList: document.getElementById('history-list'),
        imageContainer: document.querySelector('.question-image-container'),
        difficultyIndicator: document.getElementById('difficulty-indicator')
    };

    let currentQuestion = null;
    let isLoading = false;

    // Local fallback questions
    const localFallbackQuestions = [
        {
            question: "Which river is the longest in the world?",
            options: ["Amazon", "Nile", "Yangtze", "Mississippi"],
            correct_answer: "Nile",
            hint: "This river flows through northeastern Africa.",
            difficulty: "medium",
            image: null
        },
        {
            question: "What is the capital of Japan?",
            options: ["Kyoto", "Osaka", "Tokyo", "Hiroshima"],
            correct_answer: "Tokyo",
            hint: "This city hosted the 2020 Summer Olympics.",
            difficulty: "easy",
            image: null
        },
        {
            question: "Which country is known as the 'Land of the Rising Sun'?",
            options: ["China", "South Korea", "Japan", "Thailand"],
            correct_answer: "Japan",
            hint: "This country's flag features a red circle on a white background.",
            difficulty: "easy",
            image: null
        }
    ];

    // Initialize the quiz
    elements.startButton.addEventListener('click', startQuiz);
    elements.nextButton.addEventListener('click', loadNextQuestion);
    elements.hintButton.addEventListener('click', showHint);

    // Load initial history
    loadHistory();

    function startQuiz() {
        if (isLoading) return;
        loadNextQuestion();
    }

    function loadNextQuestion() {
        if (isLoading) return;
        
        isLoading = true;
        resetUIState();
        showLoadingState();
        
        fetch('/get_question')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                currentQuestion = data;
                displayQuestion(data);
                elements.startContainer.classList.add('hidden');
                elements.questionContainer.classList.remove('hidden');
                elements.resultContainer.classList.add('hidden');
                elements.nextButton.disabled = true; // Disable next button until answer is selected
            })
            .catch(error => {
                console.error('Error:', error);
                showErrorState();
            })
            .finally(() => {
                isLoading = false;
                enableButtons();
            });
    }

    function getLocalFallbackQuestion() {
        const fallback = localFallbackQuestions[Math.floor(Math.random() * localFallbackQuestions.length)];
        currentQuestion = fallback;
        displayQuestion(fallback);
    }

    function displayQuestion(data) {
        elements.questionText.textContent = data.question;
        
        // Display image
        if (data.image) {
            displayImage(data.image);
        } else {
            showImagePlaceholder();
        }
        
        // Create option buttons
        createOptionButtons(data.options);
        
        // Reset hint
        resetHint();
    }

    function displayImage(imageUrl) {
        elements.imageContainer.innerHTML = '';
        
        if (!imageUrl) {
            showImagePlaceholder();
            return;
        }

        // Create loading spinner
        const imgLoader = document.createElement('div');
        imgLoader.className = 'image-loading';
        imgLoader.innerHTML = '<div class="spinner"></div>';
        elements.imageContainer.appendChild(imgLoader);
        
        // Create and load the image
        const img = new Image();
        
        // Set up load event before setting src
        img.onload = () => {
            if (elements.imageContainer.contains(imgLoader)) {
                elements.imageContainer.removeChild(imgLoader);
            }
            img.className = 'question-image';
            elements.imageContainer.appendChild(img);
        };
        
        img.onerror = () => {
            console.error('Failed to load image:', imageUrl);
            if (elements.imageContainer.contains(imgLoader)) {
                elements.imageContainer.removeChild(imgLoader);
            }
            showImagePlaceholder();
        };
        
        // Add timeout to handle very slow loading images
        const timeoutId = setTimeout(() => {
            if (elements.imageContainer.contains(imgLoader)) {
                elements.imageContainer.removeChild(imgLoader);
                showImagePlaceholder();
                img.src = ''; // Cancel the image load
            }
        }, 5000); // 5 second timeout
        
        // Clean up timeout on successful load or error
        img.onload = () => {
            clearTimeout(timeoutId);
            if (elements.imageContainer.contains(imgLoader)) {
                elements.imageContainer.removeChild(imgLoader);
            }
            img.className = 'question-image';
            elements.imageContainer.appendChild(img);
        };
        
        img.onerror = () => {
            clearTimeout(timeoutId);
            console.error('Failed to load image:', imageUrl);
            if (elements.imageContainer.contains(imgLoader)) {
                elements.imageContainer.removeChild(imgLoader);
            }
            showImagePlaceholder();
        };
        
        // Start loading the image
        img.src = imageUrl;
    }

    function showImagePlaceholder() {
        elements.imageContainer.innerHTML = `
            <div class="image-placeholder">
                <i class="fas fa-image"></i>
                <span>No image available for this location</span>
            </div>
        `;
    }

    function createOptionButtons(options) {
        elements.optionsContainer.innerHTML = '';
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-button';
            button.textContent = option;
            button.addEventListener('click', () => selectAnswer(option));
            elements.optionsContainer.appendChild(button);
        });
    }

    function selectAnswer(selectedOption) {
        if (isLoading) return;
        
        disableOptions();
        
        fetch('/check_answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer: selectedOption })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            updateScoreDisplay(data);
            showResultFeedback(data, selectedOption);
            highlightAnswers(data.correct_answer, selectedOption);
            loadHistory();
            
            // Keep the current question visible but disable further interaction
            elements.questionContainer.classList.remove('hidden');
            disableOptions();
            elements.hintButton.disabled = true;
            elements.nextButton.disabled = false;
        })
        .catch(error => {
            console.error('Error:', error);
            showErrorState();
        });
    }

    function showResultFeedback(data, selectedOption) {
        const resultMessage = data.is_correct 
            ? `✅ Correct! The answer is ${data.correct_answer}.` 
            : `❌ Incorrect. The correct answer is ${data.correct_answer}.`;
        
        // Show result message above the question
        elements.resultText.textContent = resultMessage;
        elements.resultContainer.classList.remove('hidden');
        
        // Highlight the correct and incorrect answers
        const options = elements.optionsContainer.querySelectorAll('.option-button');
        options.forEach(button => {
            if (button.textContent === data.correct_answer) {
                button.classList.add('correct-option');
            } else if (button.textContent === selectedOption && !data.is_correct) {
                button.classList.add('incorrect-option');
            }
            button.disabled = true;
        });
    }

    function highlightAnswers(correctAnswer, selectedOption) {
        document.querySelectorAll('.option-button').forEach(button => {
            if (button.textContent === correctAnswer) {
                button.classList.add('correct-option');
            } else if (button.textContent === selectedOption) {
                button.classList.add('incorrect-option');
            }
        });
    }

    function showHint() {
        if (!currentQuestion?.hint) return;
        elements.hintText.textContent = currentQuestion.hint;
        elements.hintText.classList.remove('hidden');
        elements.hintButton.disabled = true;
    }

    function loadHistory() {
        fetch('/get_history')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                renderHistory(data);
                updateScoreDisplays(data);
            })
            .catch(() => {
                elements.historyList.innerHTML = '<div class="error-message">Failed to load history</div>';
            });
    }

    function renderHistory(data) {
        elements.historyList.innerHTML = data.history.length 
            ? data.history.slice().reverse().map(item => `
                <div class="history-item ${item.is_correct ? 'correct' : 'incorrect'}">
                    <div class="history-question">${item.question}</div>
                    <div class="history-details">
                        <span class="user-answer">You: ${item.user_answer}</span>
                        <span class="correct-answer">Correct: ${item.correct_answer}</span>
                        <span class="difficulty-badge ${item.difficulty}">${item.difficulty}</span>
                    </div>
                    <div class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</div>
                </div>
            `).join('')
            : '<div class="no-history">No quiz history yet</div>';
    }

    function updateScoreDisplays(data) {
        elements.scoreDisplay.textContent = data.score;
        elements.totalQuestionsDisplay.textContent = data.total_questions;
    }

    function resetUIState() {
        elements.questionContainer.classList.add('hidden');
        elements.resultContainer.classList.add('hidden');
        elements.hintText.classList.add('hidden');
        elements.hintButton.disabled = false;
        elements.optionsContainer.innerHTML = '';
        elements.questionText.textContent = '';
        elements.resultText.textContent = '';
        showImagePlaceholder();
    }

    function showLoadingState() {
        elements.questionText.textContent = 'Loading question...';
        elements.questionContainer.classList.remove('hidden');
        disableButtons();
        showImagePlaceholder();
    }

    function showAnswerCheckingState() {
        disableButtons();
        elements.resultText.textContent = 'Checking answer...';
        elements.resultContainer.classList.remove('hidden');
    }

    function showErrorState() {
        elements.resultText.textContent = 'An error occurred. Please try again.';
        elements.resultContainer.classList.remove('hidden');
        elements.nextButton.textContent = 'Try Again';
        enableButtons();
    }

    function resetHint() {
        elements.hintText.classList.add('hidden');
        elements.hintButton.disabled = false;
    }

    function disableOptions() {
        const options = elements.optionsContainer.querySelectorAll('.option-button');
        options.forEach(button => button.disabled = true);
    }

    function disableButtons() {
        elements.startButton.disabled = true;
        elements.hintButton.disabled = true;
        elements.nextButton.disabled = true;
    }

    function enableButtons() {
        elements.startButton.disabled = false;
        elements.hintButton.disabled = false;
        elements.nextButton.disabled = true; // Next button should be disabled until an answer is selected
    }

    function updateScoreDisplay(data) {
        elements.scoreDisplay.textContent = data.score;
        elements.totalQuestionsDisplay.textContent = data.total_questions;
    }
});
