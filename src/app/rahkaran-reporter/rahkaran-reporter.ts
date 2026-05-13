import { Component, computed, signal } from '@angular/core';
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
  name: string;
  special?: string;
  startStr: string;
  start: number;
  endStr: string;
  end: number;
  total: number;
  overtime: number;
  absence: boolean;
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
export class RahkaranReporter {
  public error = signal<string | undefined>(undefined);
  protected timer?: Subscription;
  protected employee = signal<Employee | undefined>(undefined);
  protected overtime = computed(
    () => this.employee()?.days.reduce((sum, day) => (sum += day.overtime), 0) ?? 0,
  );

  public async onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.error.set(undefined);
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    try {
      const xml = await this.readFileAsText(file);
      this.timer?.unsubscribe();
      this.timer = timer(0, 60000).subscribe(() => {
        this.employee.set(this.extractDataFromXml(xml));
      });
    } catch (err: any) {
      console.error(err);
      this.employee.set(undefined);
      this.error.set(err?.message || String(err));
    }

    if (input) input.value = '';
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
    const name = day.getElementsByTagName('ForthGroupLevel')[0].getAttribute('DayName') ?? '';
    const special =
      day.getElementsByTagName('FifthGroupLevel')[0].getAttribute('SpecialDayTitle') ?? undefined;
    const startStr = day.getElementsByTagName('Textbox9')[0].getAttribute('Textbox18') ?? '';
    const endStr = day.getElementsByTagName('Textbox2')[0].getAttribute('Textbox6') ?? '';
    const start = this.timeToMinutes(startStr);
    const end = this.timeToMinutes(endStr);

    let details: Detail[] = [];
    for (const detail of day.getElementsByTagName('Details')) {
      details.push(this.extractDetail(detail, special));
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

    const leave = // مرخصی
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

  private extractDetail(detail: Element, special?: string): Detail {
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

    const total = enter > 0 ? exit - enter : 0;

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
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)) // فارسی
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)); // عربی

    const normalized = normalizeDigits(time.trim());
    const [hoursStr, minutesStr] = normalized.split(':');
    const hours = parseInt(hoursStr);
    const minutes = parseInt(minutesStr);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  }
}
