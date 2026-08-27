-- Authors need actionable correction feedback, not other reviewers' identities
-- or internal approval notes. This does not widen the elevated queue policies.
CREATE FUNCTION safespace_private.own_sensitive_review_feedback(target_post_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('revision', r.revision, 'status', r.status,
    'corrections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stage', d.stage, 'note', d.note, 'createdAt', d."createdAt") ORDER BY d.stage)
      FROM public."SensitiveReviewDecision" d
      WHERE d."roundId" = r.id AND d.outcome = 'request_changes'), '[]'::jsonb))
  FROM public."Post" p JOIN public."SensitiveReviewRound" r
    ON r."postId" = p.id AND r.revision = p."contentRevision"
  WHERE safespace_private.context_mode() = 'user'
    AND p.id = target_post_id AND p."authorId" = safespace_private.current_user_id()
    AND safespace_private.can_read_post(p.id)
$$;

-- Own decisions remain exportable after role/access loss. No other reviewer's
-- notes, identity, report text, entity name or media is included.
CREATE FUNCTION safespace_private.export_own_sensitive_review_decisions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE actor_id uuid := safespace_private.current_user_id(); result jsonb;
BEGIN
  IF safespace_private.context_mode() <> 'user' OR actor_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id) THEN
    RAISE EXCEPTION 'authenticated identity required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'postId', r."postId", 'revision', r.revision, 'stage', d.stage,
    'outcome', d.outcome, 'note', d.note, 'createdAt', d."createdAt") ORDER BY d."createdAt", d.id), '[]'::jsonb)
  INTO result FROM public."SensitiveReviewDecision" d
    JOIN public."SensitiveReviewRound" r ON r.id = d."roundId"
  WHERE d."reviewerUserId" = actor_id;
  RETURN result;
END $$;
