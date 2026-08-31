import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { SectionTitle } from '../ui/SectionTitle';

/**
 * Emergency / alarm settings.
 *
 * Read-only, and deliberately raw. The vendor's marshaller gives the byte
 * offsets but not the label tables — those live in the CPS form resource — so
 * the "kind" and "send"/"cycle" fields are shown as the numbers the radio
 * actually holds rather than as invented names. A wrong label on an alarm
 * feature is worse than a number: it would tell the user their radio does
 * something it does not.
 *
 * Nine bytes of this record are zeroed by the vendor CPS on every write and are
 * only settable from the handset, so they are not modelled at all.
 */
const Row: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div className="flex justify-between gap-4 py-1 border-b border-panel">
    <span className="text-cool-gray">
      {label}
      {hint && <span className="text-muted"> · {hint}</span>}
    </span>
    <span className="text-white font-mono">{children}</span>
  </div>
);

export const D890EmergencyArea: React.FC = () => {
  const { d890Emergency } = useRadioStore();
  const { channels } = useChannelsStore();

  if (!d890Emergency) {
    return (
      <div>
        <SectionTitle size="lg" underline>Emergency Alarm</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its emergency settings.</p>
      </div>
    );
  }

  const { settings, contact } = d890Emergency;

  if (!settings) {
    return (
      <div>
        <SectionTitle size="lg" underline>Emergency Alarm</SectionTitle>
        <p className="text-sm text-muted">This radio has no emergency settings stored.</p>
      </div>
    );
  }

  const channelName = (number: number | null): string => {
    if (number === null) return 'None';
    const channel = channels.find((c) => c.number === number);
    return channel ? `${number} · ${channel.name}` : `${number}`;
  };

  const seconds = (v: number) => `${v} s`;

  return (
    <div>
      <SectionTitle size="lg" underline>Emergency Alarm</SectionTitle>
      <p className="text-cool-gray text-sm mb-2">
        What the radio does when the alarm key is held. Read-only.
      </p>
      <p className="text-xs text-amber-400 mb-6">
        The mode, send and cycle fields are shown as raw values — the vendor CPS holds their
        labels in its form, not in the data, so naming them here would be a guess. The
        handset-only alarm menu settings are not read at all.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 text-xs">
        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-2">Analog</h4>
          <Row label="Mode" hint="raw">{settings.analogKind}</Row>
          <Row label="Tone type" hint="raw">{settings.toneType}</Row>
          <Row label="Tone ID" hint="raw">{settings.toneId}</Row>
          <Row label="Alarm time">{seconds(settings.alarmTime)}</Row>
          <Row label="TX duration">{seconds(settings.txDuration)}</Row>
          <Row label="RX duration">{seconds(settings.rxDuration)}</Row>
          <Row label="Channel">{channelName(settings.analogChannel)}</Row>
          <Row label="Send" hint="raw">{settings.analogSend}</Row>
          <Row label="Cycle" hint="raw">{settings.analogCycle}</Row>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-2">Digital</h4>
          <Row label="Mode" hint="raw">{settings.digitalKind}</Row>
          <Row label="Alarm time">{seconds(settings.digitalAlarmTime)}</Row>
          <Row label="TX duration">{seconds(settings.digitalTxDuration)}</Row>
          <Row label="RX duration">{seconds(settings.digitalRxDuration)}</Row>
          <Row label="Channel">{channelName(settings.digitalChannel)}</Row>
          <Row label="Send" hint="raw">{settings.digitalSend}</Row>
          <Row label="Cycle" hint="raw">{settings.digitalCycle}</Row>
          <Row label="Receive alarm">{settings.receiveAlarm ? 'On' : 'Off'}</Row>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-2">Lone Worker</h4>
          <Row label="Response time">{seconds(settings.loneWorkerResponseTime)}</Row>
          <Row label="Warning time">{seconds(settings.loneWorkerWarningTime)}</Row>
          <Row label="Acknowledge" hint="raw">{settings.loneWorkerAck}</Row>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-2">Alarm Contact</h4>
          {contact ? (
            <>
              <Row label="Call type" hint="raw">{contact.callType}</Row>
              <Row label="Ring" hint="raw">{contact.ring}</Row>
              {/* null means the stored digits were not decimal — an erased or
                  never-set slot, not a code of zero. */}
              <Row label="Code">{contact.code === null ? 'Not set' : contact.code}</Row>
            </>
          ) : (
            <p className="text-muted">No alarm contact stored.</p>
          )}
        </div>
      </div>
    </div>
  );
};
