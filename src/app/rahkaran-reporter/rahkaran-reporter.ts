import { Component, computed, signal, OnInit } from '@angular/core';
import { ToHourPipe } from '../shared/pipes/to-hour-pipe';
import { NgClass } from '@angular/common';
import { Subscription, timer } from 'rxjs';

enum Status {
  GHEIBAT = 'غیبت',
  ESTEHGHAGHI = 'مرخصی استحقاقی',
  ESTELAGI = 'مرخصی استعلاجی',
  HOZOR = 'حضور',
  TATIL = 'تعطيل',
  TATIL_RASMI = 'تعطیل رسمی',
  MAMORIAT_SAATI = 'ماموریت ساعتی',
  TASHVIQI = 'مرخصی تشویقی شرکت',
}

export type JiraLogDetail = {
  issueKey: string;
  summary: string;
  minutes: number;
};

type Detail = {
  enterStr: string;
  enter: number;
  exitStr: string;
  exit: number;
  total: number;
  statusLabel: string;
  reduced: boolean;
  out: boolean;
};

type Day = {
  date: string;
  gregorianDate: string;
  name: string;
  special?: string;
  startStr: string;
  start: number;
  endStr: string;
  end: number;
  total: number;
  overtime: number;
  absence: boolean;
  jiraWorkLog?: number;
  jiraLogs?: JiraLogDetail[];
  details: Detail[];
};

type Employee = {
  department: string;
  code: string;
  name: string;
  absence: number;
  days: Day[];
};

@Component({
  selector: 'app-rahkaran-reporter',
  imports: [ToHourPipe, NgClass],
  templateUrl: './rahkaran-reporter.html',
  styleUrl: './rahkaran-reporter.scss',
})
export class RahkaranReporter implements OnInit {
  private readonly REDUCE_ENTER_ON_URGENCY = true;

  public isChartMode = false;

  public isDarkMode = signal<boolean>(false);

  public error = signal<string | undefined>(undefined);
  public isJiraLoading = signal<boolean>(false);

  public selectedDayLogs = signal<{
    date: string;
    gregorianDate: string;
    logs: JiraLogDetail[];
  } | null>(null);

  protected timer?: Subscription;
  protected employee = signal<Employee | undefined>(undefined);

  protected overtime = computed(
    () => this.employee()?.days.reduce((sum, day) => (sum += day.overtime), 0) ?? 0,
  );

  protected totalJiraWorkLog = computed(
    () => this.employee()?.days.reduce((sum, day) => (sum += day.jiraWorkLog ?? 0), 0) ?? 0,
  );

  ngOnInit() {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      this.isDarkMode.set(true);
      document.documentElement.classList.add('dark');
    }
  }

  public toggleTheme() {
    this.isDarkMode.update((val) => !val);
    if (this.isDarkMode()) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  public openWorklogDetails(day: Day) {
    if (day.jiraLogs && day.jiraLogs.length > 0) {
      this.selectedDayLogs.set({
        date: day.date,
        gregorianDate: day.gregorianDate,
        logs: day.jiraLogs,
      });
    }
  }

  public closeWorklogDetails() {
    this.selectedDayLogs.set(null);
  }

  public async onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.error.set(undefined);
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    try {
      const xml = await this.readFileAsText(file);
      this.timer?.unsubscribe();

      this.timer = timer(0, 60000).subscribe(() => {
        const newData = this.extractDataFromXml(xml);

        if (newData) {
          const currentEmp = this.employee();

          if (currentEmp) {
            newData.days.forEach((newDay) => {
              const oldDay = currentEmp.days.find((d) => d.date === newDay.date);
              if (oldDay && oldDay.jiraWorkLog !== undefined) {
                newDay.jiraWorkLog = oldDay.jiraWorkLog;
                newDay.jiraLogs = oldDay.jiraLogs;
              }
            });
          }

          this.employee.set(newData);
        } else {
          this.employee.set(undefined);
        }
      });
    } catch (err: any) {
      console.error(err);
      this.employee.set(undefined);
      this.error.set(err?.message || String(err));
    }

    if (input) input.value = '';
  }

  public async onFetchJiraWorkLog(user: string, pass: string) {
    if (!pass) {
      this.error.set('لطفاً رمز عبور یا توکن (Token) جیرا را وارد کنید.');
      return;
    }

    const currentEmployee = this.employee();
    if (!currentEmployee || currentEmployee.days.length === 0) {
      this.error.set('ابتدا فایل گزارش راهکاران را آپلود کنید تا تاریخ‌ها مشخص شوند.');
      return;
    }

    this.error.set(undefined);
    this.isJiraLoading.set(true);

    try {
      const gStart = currentEmployee.days[0].gregorianDate;
      const gEnd = currentEmployee.days[currentEmployee.days.length - 1].gregorianDate;

      if (!gStart || !gEnd) {
        throw new Error('خطا در یافتن تاریخ میلادی');
      }

      const baseUrl = '/jira-api';

      const authHeader = user ? 'Basic ' + btoa(`${user}:${pass}`) : 'Bearer ' + pass;

      const meResponse = await fetch(`${baseUrl}/rest/api/2/myself`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'X-Atlassian-Token': 'no-check',
        },
      });

      if (!meResponse.ok) {
        throw new Error('نام کاربری، رمز عبور یا توکن وارد شده نامعتبر است.');
      }

      const meData = await meResponse.json();
      const myName = meData.name;
      const myKey = meData.key;
      const myEmail = meData.emailAddress;

      const jql = `worklogAuthor = currentUser() AND worklogDate >= "${gStart}" AND worklogDate <= "${gEnd}"`;

      const searchParams = new URLSearchParams({
        jql: jql,
        fields: 'summary',
        maxResults: '1000',
      });

      const searchResponse = await fetch(
        `${baseUrl}/rest/api/2/search?${searchParams.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            'X-Atlassian-Token': 'no-check',
          },
        },
      );

      if (!searchResponse.ok) {
        throw new Error(`خطای سرور جیرا هنگام جستجو (کد: ${searchResponse.status})`);
      }

      const searchData = await searchResponse.json();
      const dailyLogsMap = new Map<string, JiraLogDetail[]>();

      if (searchData.issues && searchData.issues.length > 0) {
        const fetchWorklogsPromises = searchData.issues.map(async (issue: any) => {
          const issueKey = issue.key;
          const summary = issue.fields.summary || 'بدون عنوان';

          try {
            const wlResponse = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}/worklog`, {
              method: 'GET',
              headers: {
                Authorization: authHeader,
                Accept: 'application/json',
                'X-Atlassian-Token': 'no-check',
              },
            });

            if (!wlResponse.ok) return;

            const wlData = await wlResponse.json();

            if (wlData && wlData.worklogs) {
              wlData.worklogs.forEach((wl: any) => {
                if (
                  wl.author.name === myName ||
                  wl.author.key === myKey ||
                  wl.author.emailAddress === myEmail
                ) {
                  const dateStr = wl.started.substring(0, 10);
                  const minutes = Math.floor(wl.timeSpentSeconds / 60);

                  if (!dailyLogsMap.has(dateStr)) {
                    dailyLogsMap.set(dateStr, []);
                  }
                  dailyLogsMap.get(dateStr)!.push({ issueKey, summary, minutes });
                }
              });
            }
          } catch (err) {
            console.warn(`خطا در دریافت جزئیات لاگ برای تسک ${issueKey}`, err);
          }
        });

        await Promise.all(fetchWorklogsPromises);
      }

      const updatedDays = currentEmployee.days.map((day) => {
        const logsForDay = dailyLogsMap.get(day.gregorianDate) || [];
        const totalMinutes = logsForDay.reduce((sum, log) => sum + log.minutes, 0);

        return {
          ...day,
          jiraWorkLog: totalMinutes,
          jiraLogs: logsForDay,
        };
      });

      this.employee.set({
        ...currentEmployee,
        days: updatedDays,
      });
    } catch (err: any) {
      console.error(err);
      this.error.set(
        err?.message || 'خطای ناشناخته در ارتباط با جیرا. لطفاً کنسول مرورگر را بررسی کنید.',
      );
    } finally {
      this.isJiraLoading.set(false);
    }
  }

  private persianToGregorianString(persianDate: string): string {
    const normalizeDigits = (str: string) =>
      str
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

    const parts = normalizeDigits(persianDate.trim())
      .split(/[\/\-]/)
      .map(Number);
    if (parts.length !== 3) return '';

    const [gy, gm, gd] = this.jalaliToGregorian(parts[0], parts[1], parts[2]);
    return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
  }

  private jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    const g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

    jy += 1595;
    let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;
    for (let i = 0; i < jm - 1; ++i) days += j_days_in_month[i];

    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }

    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 1 : 0;
    g_days_in_month[1] += leap;

    let gm = 0;
    for (; gm < 12 && gd > g_days_in_month[gm]; ++gm) gd -= g_days_in_month[gm];
    return [gy, gm + 1, gd];
  }

  private extractDataFromXml(xml: string): Employee | undefined {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const department = doc.getElementsByTagName('Department')[0].getAttribute('Group1') ?? '';
      const code =
        doc.getElementsByTagName('FirstGroupLevel')[0].getAttribute('EmployeeCode') ?? '';
      const name =
        doc.getElementsByTagName('SecondGroupLevel')[0].getAttribute('EmployeeName') ?? '';

      const days: Day[] = [];
      for (const day of doc.getElementsByTagName('ThirdGroupLevel')) {
        days.push(this.extractDay(day));
      }
      return {
        code,
        department,
        name,
        days,
        absence: days.reduce((sum, day) => (sum += day.absence ? 1 : 0), 0) ?? 0,
      };
    } catch (err: any) {
      this.error.set(err?.message || String(err));
      this.employee.set(undefined);
    }
    return undefined;
  }

  private extractDay(day: Element): Day {
    const date = day.getAttribute('PersianDate') ?? '';
    const gregorianDate = this.persianToGregorianString(date);

    const name = day.getElementsByTagName('ForthGroupLevel')[0].getAttribute('DayName') ?? '';
    const special =
      day.getElementsByTagName('FifthGroupLevel')[0].getAttribute('SpecialDayTitle') ?? undefined;
    const startStr = day.getElementsByTagName('Textbox9')[0].getAttribute('Textbox18') ?? '';
    const endStr = day.getElementsByTagName('Textbox2')[0].getAttribute('Textbox6') ?? '';
    const start = this.timeToMinutes(startStr);
    const end = this.timeToMinutes(endStr);

    let details: Detail[] = [];
    for (const detail of day.getElementsByTagName('Details')) {
      details.push(this.extractDetail(detail, start, special));
    }

    details = details.map((detail, i, allDetails) => {
      if (detail.statusLabel === Status.ESTEHGHAGHI) {
        if (
          details
            .filter((d) => d.statusLabel !== Status.ESTEHGHAGHI)
            .some((dt) => dt.enter <= detail.enter && dt.exit >= detail.exit)
        )
          detail.reduced = true;
      }
      return detail;
    });

    let total = 0;
    let overtime = 0;
    let absence = false;

    const leave =
      details.every((d) => d.statusLabel === Status.ESTEHGHAGHI) ||
      details.every((d) => d.statusLabel === Status.ESTELAGI);

    if (!leave) {
      total = details.reduce((sum, d) => {
        if (d.reduced) sum -= d.total;
        else sum += d.total;
        return sum;
      }, 0);
      overtime = total > 0 ? total - (end - start) : 0;
    }

    if (!special && !leave && total === 0) {
      absence = true;
    }

    return {
      date,
      gregorianDate,
      name,
      startStr,
      endStr,
      start,
      end,
      details,
      overtime,
      special,
      total,
      absence,
    };
  }

  private extractDetail(detail: Element, start: number, special?: string): Detail {
    const statusLabel = detail.getAttribute('AttendanceStatus') ?? '';
    const enterStr = detail.getAttribute('Enter')?.trim() ?? '';
    let exitStr = detail.getAttribute('Exit')?.trim() ?? '';
    const enter = this.timeToMinutes(enterStr);
    let out = true;

    if (!special && enter > 0 && exitStr === '') {
      exitStr = this.getNowTime();
      out = false;
    }
    const exit = this.timeToMinutes(exitStr);

    const _enter = this.REDUCE_ENTER_ON_URGENCY && enter < start ? start : enter;

    const total = enter > 0 ? exit - _enter : 0;

    return {
      enterStr,
      exitStr,
      enter,
      exit,
      total,
      statusLabel,
      reduced: false,
      out,
    };
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = (e) => reject(e);
      fr.readAsText(file);
    });
  }

  private getNowTime(): string {
    const now = new Date();
    return `${now.getHours()}:${now.getMinutes()}`;
  }

  private timeToMinutes(time: string): number {
    const normalizeDigits = (str: string): string =>
      str
        .replace(/[\u200E\u200F\u202A-\u202E]|\s/g, '')
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

    const normalized = normalizeDigits(time.trim());
    const [hoursStr, minutesStr] = normalized.split(':');
    const hours = parseInt(hoursStr);
    const minutes = parseInt(minutesStr);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  }
}
