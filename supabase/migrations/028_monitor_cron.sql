-- جدولة دالة المراقبة (supabase/functions/monitor) كل 5 دقائق بنفس سر الجدولة. تُطبَّق بعد نشر الدالة وبموافقة المطوّر.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'monitor') then perform cron.unschedule('monitor'); end if;
end $$;
select cron.schedule('monitor', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/monitor',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron', (select v from public.push_cfg where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
