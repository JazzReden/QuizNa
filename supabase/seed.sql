-- ==============================================================================
-- QuizNa Optional Development Fixtures: Demo Profiles, Quizzes, Questions
-- ==============================================================================

-- 1. Demo Profiles (Note: in production Supabase auth.users triggers profile creation;
-- here we seed test IDs matching auth.users)
INSERT INTO public.profiles (id, email, full_name, role)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'teacher@quizna.dev', 'Prof. Sarah Connor', 'teacher'),
    ('b0000000-0000-0000-0000-000000000002', 'student@quizna.dev', 'Alex Mercer', 'student'),
    ('b0000000-0000-0000-0000-000000000003', 'student2@quizna.dev', 'Emma Watson', 'student')
ON CONFLICT (id) DO NOTHING;

-- 2. Demo Quiz
INSERT INTO public.quizzes (
    id,
    teacher_id,
    title,
    description,
    instructions,
    access_code,
    time_limit_minutes,
    max_attempts,
    randomize_questions,
    randomize_options,
    available_from,
    available_until,
    release_scores_immediately,
    release_answers_immediately,
    status,
    version
)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'CS 101: Data Structures & Algorithms Assessment',
    'Midterm evaluation covering algorithmic complexity, trees, and operating systems memory concepts.',
    'Please read all questions carefully. You must remain in fullscreen mode throughout the test. Tab switching and exiting fullscreen are logged as possible violations.',
    'CS101',
    20,
    1,
    false,
    false,
    timezone('utc'::text, now() - INTERVAL '1 hour'),
    timezone('utc'::text, now() + INTERVAL '7 days'),
    false,
    false,
    'published',
    1
)
ON CONFLICT (id) DO NOTHING;

-- 3. Demo Questions
INSERT INTO public.questions (
    id,
    quiz_id,
    type,
    prompt,
    explanation,
    points,
    order_index,
    options,
    correct_answer,
    rubric
)
VALUES
(
    'd0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'mcq',
    'What is the worst-case time complexity of standard QuickSort without randomized pivot selection?',
    'When the selected pivot is repeatedly the smallest or largest element, the recursion degenerates to depth n.',
    2.00,
    0,
    '[
        {"id": "opt_1", "text": "O(n log n)"},
        {"id": "opt_2", "text": "O(n²)"},
        {"id": "opt_3", "text": "O(n)"},
        {"id": "opt_4", "text": "O(log n)"}
    ]'::jsonb,
    '"opt_2"'::jsonb,
    NULL
),
(
    'd0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'true_false',
    'A standard Binary Search Tree (BST) always guarantees O(log n) lookup time regardless of insertion order.',
    'False: inserting sorted keys causes a standard BST to degenerate into a linked list with O(n) lookup time.',
    2.00,
    1,
    '[
        {"id": "opt_true", "text": "True"},
        {"id": "opt_false", "text": "False"}
    ]'::jsonb,
    '"opt_false"'::jsonb,
    NULL
),
(
    'd0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    'short_answer',
    'Which fundamental abstract data structure adheres to the First-In, First-Out (FIFO) access policy?',
    'A Queue removes elements in the exact order they were enqueued (FIFO).',
    3.00,
    2,
    NULL,
    '["queue", "Queue", "FIFO Queue"]'::jsonb,
    NULL
),
(
    'd0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000001',
    'essay',
    'Explain the primary differences between a Process and a Thread in operating systems. Specifically address memory address space sharing, creation cost, and context switching overhead.',
    'Processes have independent address spaces; threads share memory within the same process.',
    5.00,
    3,
    NULL,
    NULL,
    'Rubric (Total 5 pts): Memory Isolation & Sharing (2 pts), Creation/Destruction overhead (1.5 pts), Context switching cost & register/TLB state (1.5 pts).'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Freeze the complete private source; never hand-maintain a second question list.
INSERT INTO public.quiz_versions(id,quiz_id,version_number,snapshot_data)
SELECT 'e0000000-0000-0000-0000-000000000001',q.id,1,
  jsonb_build_object('title',q.title,'instructions',q.instructions,
    'time_limit_minutes',q.time_limit_minutes,'max_attempts',q.max_attempts,
    'randomize_questions',q.randomize_questions,'randomize_options',q.randomize_options,
    'questions',(SELECT jsonb_agg(to_jsonb(question) ORDER BY order_index) FROM public.questions question WHERE question.quiz_id=q.id))
FROM public.quizzes q WHERE q.id='c0000000-0000-0000-0000-000000000001'
ON CONFLICT(quiz_id,version_number) DO NOTHING;
