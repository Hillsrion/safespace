-- A user may flag the same post again after a moderator has decided the prior
-- flag, but concurrent pending flags for the same user/post are forbidden.
CREATE UNIQUE INDEX "PostFlag_pending_flagger_post_key"
ON "PostFlag" ("flaggerUserId", "postId")
WHERE "status" = 'pending_review';
