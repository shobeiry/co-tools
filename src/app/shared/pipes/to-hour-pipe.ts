import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'toHour'
})
export class ToHourPipe implements PipeTransform {

  transform(value?: number, showSign: boolean = false): unknown {
    if (!value || isNaN(value)) return '۰۰:۰۰';

    const sign = showSign ? (value < 0 ? '−' : value > 0 ? '+' : '') : ''; // علامت منفی فارسی
    const absMinutes = Math.abs(value);

    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    const toPersianDigits = (str: string): string =>
      str.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);

    const time = `${pad(hours)}:${pad(minutes)}`;
    return `${sign} ${toPersianDigits(time)}`;
  }

}
