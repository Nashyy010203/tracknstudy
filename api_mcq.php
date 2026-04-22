<?php
/**
 * MCQ Generator API
 * Generates Multiple Choice Questions from input text
 * Choices are context-aware and derived from the input text
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get input text
$text = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawData = file_get_contents('php://input');
    $data = json_decode($rawData, true);
    
    if (isset($data['text']) && is_string($data['text'])) {
        $text = $data['text'];
    } elseif (isset($_POST['text']) && is_string($_POST['text'])) {
        $text = $_POST['text'];
    }
}

// Always return valid JSON array
if (empty($text)) {
    echo json_encode([]);
    exit;
}

// Clean the text
$text = trim($text);
$text = preg_replace('/\s+/', ' ', $text);

// Generate MCQs
$mcqs = generateMCQs($text);

// Return JSON
echo json_encode($mcqs);

/**
 * Main MCQ generation function
 */
function generateMCQs($text) {
    $results = [];
    
    // Split into sentences
    $rawSentences = preg_split('/(?<=[.!?])\s+/', $text, -1, PREG_SPLIT_NO_EMPTY);
    
    // Clean sentences
    $validSentences = [];
    foreach ($rawSentences as $s) {
        $s = trim($s);
        $s = preg_replace('/\s+/', ' ', $s);
        if (strlen($s) > 20) {
            $validSentences[] = $s;
        }
    }
    
    if (empty($validSentences)) {
        return $results;
    }
    
    // Extract all key nouns/phrases from the entire text for use as distractors
    $allNouns = extractNounPhrases($text);
    $allNumbers = extractNumbers($text);
    $allEntities = extractEntities($text);
    
    // Extract facts from each sentence
    $allFacts = [];
    foreach ($validSentences as $idx => $sentence) {
        $facts = extractFactsFromSentence($sentence, $idx, $validSentences);
        $allFacts = array_merge($allFacts, $facts);
    }
    
    // If no facts extracted, try keyword-based approach
    if (empty($allFacts)) {
        $allFacts = generateFactsFromKeywords($validSentences, $text);
    }
    
    // Build a pool of all predicates/answers from the text (for distractors)
    $allPredicates = [];
    foreach ($allFacts as $fact) {
        if (strlen($fact['predicate']) > 2 && strlen($fact['predicate']) < 80) {
            $allPredicates[] = $fact['predicate'];
        }
    }
    
    // Generate MCQ for each fact
    $usedSubjects = [];
    foreach ($allFacts as $fact) {
        if (count($results) >= 20) break;
        
        $subjectKey = strtolower(trim($fact['subject']));
        if (isset($usedSubjects[$subjectKey])) continue;
        $usedSubjects[$subjectKey] = true;
        
        $correctAnswer = $fact['predicate'];
        
        // Generate question
        $question = createQuestion($fact['subject'], $correctAnswer, $fact['type'], $fact['sentence']);
        
        // Generate context-aware choices
        $choices = generateContextAwareChoices(
            $correctAnswer,
            $allPredicates,
            $allNouns,
            $allNumbers,
            $allEntities,
            $fact
        );
        
        // Shuffle choices
        shuffle($choices);
        
        // Find correct answer position
        $correctIdx = array_search($correctAnswer, $choices);
        if ($correctIdx === false) {
            $correctIdx = 0;
            $choices[0] = $correctAnswer;
        }
        
        $results[] = [
            'type' => 'mcq',
            'question' => $question,
            'choices' => $choices,
            'correctAnswer' => $correctAnswer
        ];
    }
    
    return $results;
}

/**
 * Extract noun phrases from text for use as distractors
 */
function extractNounPhrases($text) {
    $phrases = [];
    
    // Extract capitalized multi-word phrases (proper nouns)
    preg_match_all('/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/', $text, $matches);
    foreach ($matches[1] as $phrase) {
        $phrase = trim($phrase);
        if (strlen($phrase) > 2 && !in_array($phrase, $phrases)) {
            $phrases[] = $phrase;
        }
    }
    
    // Extract noun phrases with articles
    preg_match_all('/\b(?:the|a|an)\s+([a-z]+(?:\s+[a-z]+){0,2})\b/i', $text, $matches);
    foreach ($matches[0] as $phrase) {
        $phrase = trim($phrase);
        if (strlen($phrase) > 5 && !in_array($phrase, $phrases)) {
            $phrases[] = $phrase;
        }
    }
    
    // Extract significant words (4+ chars, not common words)
    $stopWords = ['that', 'with', 'from', 'this', 'they', 'their', 'there', 'these', 'those',
                  'which', 'what', 'where', 'when', 'been', 'have', 'will', 'does', 'also',
                  'into', 'over', 'such', 'than', 'then', 'them', 'only', 'other', 'about',
                  'could', 'after', 'before', 'between', 'through', 'because', 'while'];
    
    preg_match_all('/\b([a-z]{4,})\b/i', $text, $matches);
    foreach ($matches[1] as $word) {
        if (!in_array(strtolower($word), $stopWords) && !in_array($word, $phrases)) {
            $phrases[] = $word;
        }
    }
    
    return array_unique($phrases);
}

/**
 * Extract numbers with units from text
 */
function extractNumbers($text) {
    $numbers = [];
    preg_match_all('/\b(\d+(?:\.\d+)?)\s*(km|miles|meters|feet|degrees|kilometers|percent|%|million|billion|years|days|months|hours|minutes|seconds|meters|cm|mm|kg|tons|mph|AU|light-years?)?\b/i', $text, $matches);
    
    foreach ($matches[0] as $num) {
        $num = trim($num);
        if (strlen($num) > 0 && !in_array($num, $numbers)) {
            $numbers[] = $num;
        }
    }
    
    return $numbers;
}

/**
 * Extract named entities (capitalized words/phrases)
 */
function extractEntities($text) {
    $entities = [];
    
    // Multi-word proper nouns
    preg_match_all('/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/', $text, $matches);
    foreach ($matches[1] as $entity) {
        if (!in_array($entity, $entities)) {
            $entities[] = $entity;
        }
    }
    
    // Single capitalized words (skip sentence-starting words)
    $sentences = preg_split('/[.!?]+/', $text);
    foreach ($sentences as $sentence) {
        $words = preg_split('/\s+/', trim($sentence));
        for ($i = 1; $i < count($words); $i++) { // Skip first word
            $word = preg_replace('/[^a-zA-Z]/', '', $words[$i]);
            if (strlen($word) > 2 && ctype_upper($word[0]) && !in_array($word, $entities)) {
                $skipWords = ['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'It', 'Its'];
                if (!in_array($word, $skipWords)) {
                    $entities[] = $word;
                }
            }
        }
    }
    
    return $entities;
}

/**
 * Extract facts from a single sentence - multiple patterns
 */
function extractFactsFromSentence($sentence, $idx, $allSentences) {
    $facts = [];
    $sentence = trim($sentence);
    
    // Pattern 1: "X is/are/was/were Y" (with optional article before subject)
    if (preg_match('/^(?:The\s+)?([A-Z][a-zA-Z\s]{1,40}?)\s+(is|are|was|were)\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[3]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 3 && strlen($predicate) < 100) {
            $type = classifyFactType($predicate);
            $facts[] = [
                'subject' => (strpos($sentence, 'The ') === 0) ? 'The ' . $subject : $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => $type,
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 2: "X has/have/had Y"
    if (empty($facts) && preg_match('/^(?:The\s+)?([A-Z][a-zA-Z\s]{1,40}?)\s+(has|have|had)\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[3]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 3 && strlen($predicate) < 100) {
            $facts[] = [
                'subject' => (strpos($sentence, 'The ') === 0) ? 'The ' . $subject : $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => 'has',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 3: "X is known for Y"
    if (empty($facts) && preg_match('/^([A-Z][a-zA-Z\s]{1,40}?)\s+(?:is|are|was|were)\s+known\s+for\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[2]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 3 && strlen($predicate) < 100) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => 'known',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 4: "X, often called Y, Z" - extract the alias
    if (empty($facts) && preg_match('/^([A-Z][a-zA-Z\s]{1,40}?),\s*(?:often\s+)?called\s+(.+?),\s*(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $alias = trim($m[2]);
        $rest = trim($m[3]);
        
        if (strlen($alias) > 2 && strlen($alias) < 50) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => 'often called ' . $alias,
                'sentence' => $sentence,
                'type' => 'called',
                'idx' => $idx
            ];
        }
        
        // Also create a fact from the rest of the sentence
        if (strlen($rest) > 5 && strlen($rest) < 80) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $rest,
                'sentence' => $sentence,
                'type' => 'has',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 5: "X is called Y"
    if (empty($facts) && preg_match('/^([A-Z][a-zA-Z\s]{1,40}?)\s+(?:is|are|was|were)\s+(?:called|named)\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[2]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 2 && strlen($predicate) < 60) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => 'called',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 6: "X contains Y"
    if (empty($facts) && preg_match('/^([A-Z][a-zA-Z\s]{1,40}?)\s+contains\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[2]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 3 && strlen($predicate) < 100) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => 'contains',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 7: "X, which/that Y" - descriptive clause
    if (empty($facts) && preg_match('/^([A-Z][a-zA-Z\s]{1,40}?),\s*(?:which|that)\s+(.+?)([.!?]?)$/', $sentence, $m)) {
        $subject = trim($m[1]);
        $predicate = trim($m[2]);
        $predicate = trim($predicate, ",;:");
        
        if (strlen($subject) > 2 && strlen($predicate) > 5 && strlen($predicate) < 100) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $predicate,
                'sentence' => $sentence,
                'type' => 'what',
                'idx' => $idx
            ];
        }
    }
    
    // Pattern 8: Sentences with numbers - extract numeric facts
    if (preg_match_all('/(\d+(?:\.\d+)?)\s*(km|miles|meters|feet|degrees|kilometers|percent|%|million|billion|years|days|months|centimeters|hours|minutes|seconds|AU)/i', $sentence, $numMatches)) {
        // Find a subject for the number
        $subject = 'this fact';
        if (preg_match('/^([A-Z][a-zA-Z\s]{1,30}?)(?:\s+is|\s+has|\s+was|\s+,)/', $sentence, $subjMatch)) {
            $subject = trim($subjMatch[1]);
        }
        
        foreach ($numMatches[0] as $num) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => trim($num),
                'sentence' => $sentence,
                'type' => 'numeric',
                'idx' => $idx
            ];
        }
    }
    
    return $facts;
}

/**
 * Classify fact type based on predicate content
 */
function classifyFactType($predicate) {
    if (preg_match('/\b(largest|smallest|biggest|hottest|coldest|farthest|closest|first|last|highest|lowest|most|least)\b/i', $predicate)) {
        return 'superlative';
    }
    if (preg_match('/\b(\d+)\b/', $predicate)) {
        return 'numeric';
    }
    if (preg_match('/\b(only|unique|sole)\b/i', $predicate)) {
        return 'unique';
    }
    return 'what';
}

/**
 * Generate facts from keywords when no patterns match
 */
function generateFactsFromKeywords($sentences, $fullText) {
    $facts = [];
    
    // Extract key terms from each sentence
    foreach ($sentences as $idx => $sentence) {
        // Find the main subject (first significant noun)
        $words = preg_split('/\s+/', $sentence);
        $subject = '';
        $description = '';
        
        foreach ($words as $wi => $word) {
            $clean = preg_replace('/[^a-zA-Z]/', '', $word);
            if (strlen($clean) > 3 && ctype_upper($clean[0])) {
                $subject = $clean;
                // Get the rest of the sentence as description
                $rest = array_slice($words, $wi + 1);
                $description = implode(' ', $rest);
                $description = trim($description, ".,;:!?");
                break;
            }
        }
        
        if ($subject && strlen($description) > 5 && strlen($description) < 80) {
            $facts[] = [
                'subject' => $subject,
                'predicate' => $description,
                'sentence' => $sentence,
                'type' => 'what',
                'idx' => $idx
            ];
        }
    }
    
    // If still no facts, use sentence fragments
    if (empty($facts)) {
        foreach ($sentences as $idx => $sentence) {
            if (strlen($sentence) > 30) {
                // Extract a key phrase from the sentence
                $words = preg_split('/\s+/', $sentence);
                if (count($words) >= 4) {
                    $subject = $words[0] . ' ' . $words[1];
                    $predicate = implode(' ', array_slice($words, 2, 6));
                    $facts[] = [
                        'subject' => trim($subject, ',.;:'),
                        'predicate' => trim($predicate, ',.;:'),
                        'sentence' => $sentence,
                        'type' => 'what',
                        'idx' => $idx
                    ];
                }
            }
            if (count($facts) >= 5) break;
        }
    }
    
    return $facts;
}

/**
 * Create a question from subject and predicate
 */
function createQuestion($subject, $predicate, $type, $sentence) {
    $subject = trim($subject);
    
    switch ($type) {
        case 'known':
            return "What is $subject known for?";
        case 'has':
            return "What does $subject have?";
        case 'contains':
            return "What does $subject contain?";
        case 'called':
            return "What is $subject called?";
        case 'numeric':
            return "What is the correct value for $subject?";
        case 'superlative':
            return "Which statement best describes $subject?";
        case 'unique':
            return "What makes $subject unique?";
        default:
            return "What is true about $subject?";
    }
}

/**
 * Generate context-aware choices using the input text
 * This is the KEY function that makes distractors realistic
 */
function generateContextAwareChoices($correctAnswer, $allPredicates, $allNouns, $allNumbers, $allEntities, $currentFact) {
    $choices = [$correctAnswer];
    $correctLower = strtolower($correctAnswer);
    
    // STRATEGY 1: Use other predicates from the same text as distractors
    // These are the BEST distractors because they're from the same domain
    $otherPredicates = [];
    foreach ($allPredicates as $pred) {
        if (strtolower($pred) !== $correctLower && strlen($pred) > 2) {
            // Skip if too similar to correct answer
            similar_text(strtolower($pred), $correctLower, $sim);
            if ($sim < 70) {
                $otherPredicates[] = $pred;
            }
        }
    }
    shuffle($otherPredicates);
    
    foreach ($otherPredicates as $pred) {
        if (count($choices) >= 4) break;
        if (!in_array($pred, $choices)) {
            $choices[] = $pred;
        }
    }
    
    // STRATEGY 2: If we still need choices, generate "near miss" distractors
    // by modifying the correct answer in plausible ways
    if (count($choices) < 4) {
        $nearMisses = generateNearMissDistractors($correctAnswer, $currentFact);
        foreach ($nearMisses as $miss) {
            if (count($choices) >= 4) break;
            if (!in_array($miss, $choices) && strtolower($miss) !== $correctLower) {
                $choices[] = $miss;
            }
        }
    }
    
    // STRATEGY 3: Use entities and nouns from the text
    if (count($choices) < 4) {
        $textTerms = array_merge($allEntities, $allNouns);
        shuffle($textTerms);
        
        foreach ($textTerms as $term) {
            if (count($choices) >= 4) break;
            $termLower = strtolower($term);
            if ($termLower !== $correctLower && !in_array($term, $choices) && strlen($term) > 2) {
                similar_text($termLower, $correctLower, $sim);
                if ($sim < 60) {
                    $choices[] = $term;
                }
            }
        }
    }
    
    // STRATEGY 4: Use numbers from the text for numeric questions
    if (count($choices) < 4 && preg_match('/\d/', $correctAnswer)) {
        foreach ($allNumbers as $num) {
            if (count($choices) >= 4) break;
            if ($num !== $correctAnswer && !in_array($num, $choices)) {
                $choices[] = $num;
            }
        }
    }
    
    // STRATEGY 5: Generate plausible but wrong alternatives based on context
    if (count($choices) < 4) {
        $contextualDistractors = generateContextualDistractors($correctAnswer, $currentFact);
        foreach ($contextualDistractors as $d) {
            if (count($choices) >= 4) break;
            if (!in_array($d, $choices)) {
                $choices[] = $d;
            }
        }
    }
    
    // Ensure we have exactly 4 choices
    while (count($choices) < 4) {
        $choices[] = 'None of the above';
    }
    
    return array_slice($choices, 0, 4);
}

/**
 * Generate "near miss" distractors by modifying the correct answer
 */
function generateNearMissDistractors($correctAnswer, $fact) {
    $distractors = [];
    $answer = $correctAnswer;
    
    // Strategy A: Replace key words with opposites/alternatives
    $replacements = [
        'largest' => 'smallest', 'smallest' => 'largest',
        'hottest' => 'coldest', 'coldest' => 'hottest',
        'closest' => 'farthest', 'farthest' => 'closest',
        'fastest' => 'slowest', 'slowest' => 'fastest',
        'first' => 'last', 'last' => 'first',
        'highest' => 'lowest', 'lowest' => 'highest',
        'oldest' => 'newest', 'newest' => 'oldest',
        'only' => 'one of many',
        'unique' => 'common',
        'spectacular' => 'ordinary',
        'massive' => 'tiny',
        'famous' => 'unknown',
        'protective' => 'harmful',
        'liquid' => 'solid',
        'solid' => 'liquid',
        'gaseous' => 'solid',
        'thick' => 'thin',
        'thin' => 'thick',
        'ice' => 'rock',
        'rock' => 'ice',
        'eight' => 'seven',
        'eight' => 'nine',
    ];
    
    foreach ($replacements as $from => $to) {
        if (stripos($answer, $from) !== false) {
            $modified = str_ireplace($from, $to, $answer);
            if ($modified !== $answer && !in_array($modified, $distractors)) {
                $distractors[] = $modified;
            }
        }
    }
    
    // Strategy B: For numeric answers, create off-by-one or scale variants
    if (preg_match('/(\d+(?:\.\d+)?)\s*(.*)/', $answer, $numMatch)) {
        $number = floatval($numMatch[1]);
        $unit = trim($numMatch[2]);
        
        // Create variations
        $variations = [
            $number + 1,
            $number - 1,
            $number * 2,
            round($number / 2),
            $number + 10,
            $number - 10,
        ];
        
        foreach ($variations as $var) {
            if ($var > 0) {
                $candidate = $unit ? "$var $unit" : (string)$var;
                if ($candidate !== $answer && !in_array($candidate, $distractors)) {
                    $distractors[] = $candidate;
                }
            }
            if (count($distractors) >= 3) break;
        }
    }
    
    // Strategy C: Remove or add words to create similar but wrong answers
    $words = preg_split('/\s+/', $answer);
    if (count($words) >= 3) {
        // Remove a middle word
        $midIdx = floor(count($words) / 2);
        $removed = $words;
        array_splice($removed, $midIdx, 1);
        $distractors[] = implode(' ', $removed);
        
        // Swap two words
        if (count($words) >= 4) {
            $swapped = $words;
            $temp = $swapped[0];
            $swapped[0] = $swapped[1];
            $swapped[1] = $temp;
            $distractors[] = implode(' ', $swapped);
        }
    }
    
    return $distractors;
}

/**
 * Generate contextual distractors based on the sentence/topic
 */
function generateContextualDistractors($correctAnswer, $fact) {
    $distractors = [];
    $sentence = isset($fact['sentence']) ? strtolower($fact['sentence']) : '';
    
    // If the sentence mentions specific topics, generate related but wrong answers
    if (stripos($sentence, 'planet') !== false) {
        $planetFacts = [
            'completing its orbit in 365 days',
            'the third planet from the Sun',
            'known for its rings',
            'a gas giant with many moons',
            'the closest planet to Earth',
        ];
        foreach ($planetFacts as $pf) {
            if (strtolower($pf) !== strtolower($correctAnswer) && !in_array($pf, $distractors)) {
                $distractors[] = $pf;
            }
            if (count($distractors) >= 2) break;
        }
    }
    
    if (stripos($sentence, 'storm') !== false || stripos($sentence, 'weather') !== false) {
        $weatherFacts = ['a hurricane', 'a tornado', 'a cyclone', 'a monsoon'];
        foreach ($weatherFacts as $wf) {
            if (strtolower($wf) !== strtolower($correctAnswer) && !in_array($wf, $distractors)) {
                $distractors[] = $wf;
            }
            if (count($distractors) >= 1) break;
        }
    }
    
    // Generic contextual fillers based on type
    if (empty($distractors)) {
        if (isset($fact['type']) && $fact['type'] === 'numeric') {
            $distractors[] = 'Not measurable';
            $distractors[] = 'Varies significantly';
        } else {
            $distractors[] = 'A different phenomenon entirely';
            $distractors[] = 'Not mentioned in the text';
        }
    }
    
    return $distractors;
}
