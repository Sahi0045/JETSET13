-- Can a signed-in customer change their own role? Runs as `authenticated` with
-- the given user's JWT claims, tries the three ways in, and always ends by
-- raising an exception so nothing it did is kept. The outcome is in the error
-- message. Run with psql or the Supabase SQL editor; :uid is an existing user.
do $$
declare
  uid uuid := '__UID__';
  fake uuid := gen_random_uuid();
  n int;
  role_now text;
  update_outcome text;
  insert_outcome text;
  staff_outcome text;
begin
  -- 1. A customer updating their own row.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  begin
    -- To a role different from the current one, so a change is visible.
    update public.users set role = case when role = 'admin' then 'user' else 'admin' end where id = uid;
    get diagnostics n = row_count;
    select role into role_now from public.users where id = uid;
    update_outcome := format('NOT BLOCKED (rows %s, role now %s)', n, role_now);
  exception when others then
    update_outcome := 'blocked: ' || sqlerrm;
  end;

  -- 2. A customer inserting a row for themselves (after deleting their own).
  perform set_config('request.jwt.claims', json_build_object('sub', fake, 'role', 'authenticated')::text, true);
  begin
    insert into public.users (id, name, email, role, password) values (fake, 'role guard test', fake || '@role-guard.invalid', 'admin', '');
    select role into role_now from public.users where id = fake;
    insert_outcome := format('inserted with role %s', role_now);
  exception when others then
    insert_outcome := 'blocked: ' || sqlerrm;
  end;

  -- 3. The backend (service role) must still be able to change roles.
  perform set_config('role', 'service_role', true);
  begin
    update public.users set role = role where id = uid;
    update public.users set role = case when role = 'agent' then 'user' else 'agent' end where id = uid;
    get diagnostics n = row_count;
    staff_outcome := format('allowed (rows %s)', n);
  exception when others then
    staff_outcome := 'BROKEN: ' || sqlerrm;
  end;

  raise exception 'ROLE GUARD TEST (rolled back) | customer update: % | customer insert: % | service role: %',
    update_outcome, insert_outcome, staff_outcome;
end $$;
