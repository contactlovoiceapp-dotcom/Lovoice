-- Seeds the initial French prompt catalog for voice onboarding.
INSERT INTO public.prompts (body, category)
SELECT seed_prompts.body, seed_prompts.category
FROM (
  VALUES
    ('Ma pire honte en cuisine 🍳', 'fun'),
    ('Mon plus beau voyage solo ✈️', 'travel'),
    ('Ce qui me fait vibrer 🎶', 'personality'),
    ('Le dimanche parfait selon moi ☕', 'lifestyle'),
    ('Une opinion légère qui me définit 💬', 'personality'),
    ('Le son que je remets toujours trop fort 🎧', 'music'),
    ('Une petite victoire dont je suis fier·ère 🌟', 'life'),
    ('Ce que mes amis disent toujours de moi 🤭', 'personality')
) AS seed_prompts(body, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prompts
  WHERE prompts.body = seed_prompts.body
);
