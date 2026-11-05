-- Run this once in Supabase Dashboard > SQL Editor to enable dashboard music uploads.
-- Public read access lets store visitors play the current track. Uploads remain server-only.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'jayey-media',
  'jayey-media',
  true,
  5242880,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
