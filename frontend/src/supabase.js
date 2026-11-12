import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://kpilkcpfjklxwcbcicpc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwaWxrY3BmamtseHdjYmNpY3BjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMzA1OTQsImV4cCI6MjA5MzcwNjU5NH0.bqdvTB1bhrfE4gaN0v0C05-eMyIt_A9ty1a5UpJm3os'
);